"""
routers/reports.py — Rapports hebdomadaires et analyse IA de reçus.
"""
import os
import json
import base64
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from core import get_db, sql_params, now_iso, get_current_user, logger, ANTHROPIC_API_KEY

router = APIRouter(tags=["reports"])


# ── CLT-08: Weekly report ─────────────────────────────────────────────────────
@router.get("/api/reports/weekly")
def get_weekly_report(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        uid_v = user["sub"]
        projects = [dict(r._mapping) for r in conn.execute(
            *sql_params("SELECT id, nom, pct, budget FROM projects WHERE user_id=? ORDER BY created_at DESC", [uid_v])
        ).fetchall()]
        expenses = [dict(r._mapping) for r in conn.execute(
            *sql_params("SELECT description, montant, categorie, date FROM expenses WHERE user_id=? AND deleted=0 AND created_at>=? ORDER BY date DESC", [uid_v, week_ago])
        ).fetchall()]
        total_week = sum(e["montant"] for e in expenses)
        photo_count = conn.execute(
            *sql_params("SELECT COUNT(*) FROM photos WHERE user_id=? AND created_at>=?", [uid_v, week_ago])
        ).scalar() or 0
        msg_count = conn.execute(
            *sql_params("SELECT COUNT(*) FROM user_chats WHERE recipient_id=? AND created_at>=?", [uid_v, week_ago])
        ).scalar() or 0
        return {
            "week_start": week_ago[:10],
            "week_end": datetime.utcnow().date().isoformat(),
            "projects": projects,
            "expenses_count": len(expenses),
            "expenses_total": total_week,
            "expenses": expenses,
            "photos_added": photo_count,
            "new_messages": msg_count,
        }
    finally:
        conn.close()


@router.post("/api/reports/weekly/email")
async def send_weekly_report_email(user: dict = Depends(get_current_user)):
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    if not smtp_host or not smtp_user:
        return {"ok": False, "message": "Service email non configuré sur ce serveur."}
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        conn = get_db()
        try:
            week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
            uid_v = user["sub"]
            u_row = conn.execute(*sql_params("SELECT email, prenom FROM users WHERE id=?", [uid_v])).fetchone()
            if not u_row:
                raise HTTPException(404, "Utilisateur non trouvé")
            u = dict(u_row._mapping)
            expenses = conn.execute(
                *sql_params("SELECT description, montant, categorie FROM expenses WHERE user_id=? AND deleted=0 AND created_at>=?", [uid_v, week_ago])
            ).fetchall()
            total = sum(e[1] for e in expenses)
        finally:
            conn.close()
        subject = "ShantiLink — Votre rapport hebdomadaire"
        body = f"Bonjour {u['prenom']},\n\nVoici votre résumé de la semaine :\n\n"
        body += f"Total dépenses : {total:,.0f} DH\n"
        body += f"{len(expenses)} dépense(s) enregistrée(s)\n\n"
        body += "Retrouvez le détail complet sur votre tableau de bord ShantiLink.\n\nL'équipe ShantiLink"
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = u["email"]
        msg.attach(MIMEText(body, "plain", "utf-8"))
        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        logger.info(f"Weekly report sent to {u['email']}")
        return {"ok": True, "message": "Rapport envoyé à " + u["email"]}
    except Exception as e:
        logger.error(f"Failed to send weekly report email: {e}")
        raise HTTPException(500, "Échec de l'envoi du rapport")


# ── Analyse IA de reçus ───────────────────────────────────────────────────────
_RECEIPT_SYSTEM = """Tu es un assistant spécialisé dans l'extraction de données de documents BTP marocains.
Analyse l'image fournie (ticket de caisse, facture, bon de livraison, étiquette de prix)
et retourne UNIQUEMENT un objet JSON valide avec ces champs :
{
  "montant": <nombre ou null>,
  "devise": "MAD" | "EUR" | null,
  "fournisseur": <string ou null>,
  "date": <"YYYY-MM-DD" ou null>,
  "description": <string court ou null>,
  "categorie": "materiaux"|"maindoeuvre"|"transport"|"equipement"|"autre"|null,
  "articles": [{"nom":string,"quantite":number,"prix_unitaire":number}] | null
}
Règles : montant en dirhams → devise MAD. Retourne SEULEMENT le JSON, sans texte autour."""

_VOICE_SYSTEM = """Tu es un assistant BTP marocain. L'utilisateur parle en français ou en darija marocaine.
Extrais les informations financières depuis ce texte et retourne UNIQUEMENT un objet JSON :
{
  "montant": <nombre ou null>,
  "devise": "MAD" | "EUR" | null,
  "fournisseur": <string ou null>,
  "date": <"YYYY-MM-DD" ou null>,
  "description": <string ou null>,
  "categorie": "materiaux"|"maindoeuvre"|"transport"|"equipement"|"autre"|null
}
Exemples darija : "khems miyya d reaux" = 500 MAD. Retourne SEULEMENT le JSON."""


class AnalyzeReceiptIn(BaseModel):
    image: str
    media_type: str = "image/jpeg"


class ExtractVoiceIn(BaseModel):
    transcription: str


@router.post("/api/analyze-receipt")
async def analyze_receipt(data: AnalyzeReceiptIn, user: dict = Depends(get_current_user)):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(400, "Analyse IA non configurée sur ce serveur.")
    try:
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=800,
            system=_RECEIPT_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": data.media_type, "data": data.image}},
                    {"type": "text", "text": "Extrais les données de ce document BTP."}
                ]
            }]
        )
        raw = response.content[0].text if response.content else ""
        m = re.search(r'\{[\s\S]*\}', raw)
        if not m:
            return {"result": None}
        return {"result": json.loads(m.group(0))}
    except Exception as e:
        raise HTTPException(500, f"Analyse échouée : {str(e)}")


def _extract_voice_regex(transcription: str) -> dict:
    """Extraction locale French + Darija — zéro API."""
    t = transcription.lower().strip()
    result: dict = {"devise": "MAD", "date": now_iso()[:10]}

    pm = re.search(r'(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:dh|mad|dirham)', t) or \
         re.search(r'(?:à|a|pour|coûte?|prix)\s*(\d[\d\s]*(?:[.,]\d{1,2})?)', t)
    if pm:
        result["montant"] = float(pm.group(1).replace(' ', '').replace(',', '.'))
    else:
        nums = [float(x.replace(',', '.')) for x in re.findall(r'\d+(?:[.,]\d{1,2})?', t)
                if float(x.replace(',', '.')) > 9]
        if nums:
            result["montant"] = max(nums)

    cat_map = [
        (['ciment', 'sable', 'gravier', 'fer ', 'brique', 'béton', 'beton', 'parpaing'], 'materiaux'),
        (['ouvrier', 'maçon', 'macon', 'main.d', 'plâtrier', 'carreleur'], 'maindoeuvre'),
        (['transport', 'camion', 'livraison', 'chauffeur'], 'transport'),
        (['outil', 'machine', 'bétonnière', 'betoniere', 'perceuse'], 'equipement'),
    ]
    for kws, cat in cat_map:
        if any(k in t for k in kws):
            result["categorie"] = cat
            break
    else:
        result["categorie"] = "autre"

    result.setdefault("description", result.get("categorie", ""))
    return result


@router.post("/api/extract-voice")
async def extract_voice(data: ExtractVoiceIn, user: dict = Depends(get_current_user)):
    if ANTHROPIC_API_KEY:
        try:
            import anthropic as _anthropic
            client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            today = now_iso()[:10]
            response = client.messages.create(
                model="claude-sonnet-4-5", max_tokens=400,
                system=_VOICE_SYSTEM + f"\nDate du jour : {today}",
                messages=[{"role": "user", "content": f'Transcription : "{data.transcription}"'}]
            )
            raw = response.content[0].text if response.content else ""
            m = re.search(r'\{[\s\S]*\}', raw)
            if m:
                return {"result": json.loads(m.group(0))}
        except Exception:
            pass
    return {"result": _extract_voice_regex(data.transcription)}
