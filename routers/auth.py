"""
routers/auth.py — Register, login, logout, /api/me, profile, MRE, company, bootstrap.
"""
import re
import os
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Body
from fastapi.responses import JSONResponse
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from core import (
    get_db, sql_params, uid, now_iso,
    hash_password, verify_password, _needs_rehash,
    create_token, _token_hash,
    get_current_user, log_activity,
    PLAN_LIMITS, _ENV
)

router = APIRouter(tags=["auth"])


# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    prenom: str
    nom: Optional[str] = ""
    email: str
    password: str
    role: str = "client"
    ville: Optional[str] = ""
    ref_code: Optional[str] = ""


class LoginIn(BaseModel):
    email: str
    password: str


class ProfileIn(BaseModel):
    prenom: Optional[str] = None
    nom: Optional[str] = None
    ville: Optional[str] = None
    tel: Optional[str] = None
    bio: Optional[str] = None


class MreVerifyIn(BaseModel):
    country: str
    document_type: str = "passport"


# ── Rate limit (in-memory) ────────────────────────────────────────────────────
_login_attempts: dict = {}


def _check_login_rate(ip: str):
    now = time.time()
    window = _login_attempts.get(ip, {"count": 0, "window": now, "blocked_until": 0})
    if window["blocked_until"] > now:
        wait = int(window["blocked_until"] - now)
        raise HTTPException(429, f"Trop de tentatives. Réessayez dans {wait}s.")
    if now - window["window"] > 60:
        window = {"count": 1, "window": now, "blocked_until": 0}
    else:
        window["count"] += 1
        if window["count"] > 5:
            window["blocked_until"] = now + 60
            raise HTTPException(429, "Trop de tentatives. Réessayez dans 60s.")
    _login_attempts[ip] = window


# ── Register ──────────────────────────────────────────────────────────────────
@router.post("/api/auth/register", status_code=201)
@router.post("/api/register", status_code=201)
def register(data: RegisterIn):
    if len(data.password) < 10:
        raise HTTPException(400, "Mot de passe minimum 10 caractères")
    if not re.search(r'[A-Z]', data.password):
        raise HTTPException(400, "Le mot de passe doit contenir au moins une majuscule")
    if not re.search(r'[0-9]', data.password):
        raise HTTPException(400, "Le mot de passe doit contenir au moins un chiffre")
    if not re.search(r'[^A-Za-z0-9]', data.password):
        raise HTTPException(400, "Le mot de passe doit contenir au moins un caractère spécial")
    if "@" not in data.email or "." not in data.email.split("@")[-1]:
        raise HTTPException(400, "Email invalide")
    conn = get_db()
    try:
        existing = conn.execute(*sql_params("SELECT id FROM users WHERE email=?", [data.email.lower()])).fetchone()
        if existing:
            raise HTTPException(409, "Cet email est déjà utilisé. Connectez-vous.")
        user_id = "u" + uid()
        referral_code = "SL" + user_id[-6:].upper()
        conn.execute(*sql_params(
            "INSERT INTO users (id,prenom,nom,email,password_hash,role,ville,created_at,status,bio,photo_url,is_verified,referral_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [user_id, data.prenom.strip(), data.nom.strip(), data.email.lower(),
             hash_password(data.password), data.role, data.ville.strip(), now_iso(),
             'active', '', '', 0, referral_code]
        ))
        ref_code = getattr(data, 'ref_code', None)
        if ref_code:
            referrer = conn.execute(*sql_params("SELECT id FROM users WHERE referral_code=?", [ref_code])).fetchone()
            if referrer:
                conn.execute(*sql_params(
                    "INSERT INTO referrals (id,referrer_id,referred_email,referred_user_id,status,created_at) VALUES (?,?,?,?,?,?)",
                    ["r" + uid(), referrer[0], data.email.lower(), user_id, "completed", now_iso()]
                ))
        founder_badge = None
        try:
            badge_num_row = conn.execute(text(
                "INSERT INTO founder_badges (user_id, badge_number, created_at) "
                "SELECT :uid, COUNT(*)+1, :at FROM founder_badges HAVING COUNT(*) < 100"
            ), {"uid": user_id, "at": now_iso()})
            if badge_num_row.rowcount > 0:
                fb = conn.execute(*sql_params("SELECT badge_number FROM founder_badges WHERE user_id=?", [user_id])).fetchone()
                founder_badge = fb[0] if fb else None
        except Exception:
            pass
        log_activity(conn, user_id, "Compte créé")
        conn.commit()
        token = create_token(user_id, data.email.lower())
        return {
            "token": token,
            "user": {"id": user_id, "prenom": data.prenom, "nom": data.nom,
                     "email": data.email.lower(), "role": data.role, "ville": data.ville,
                     "tel": "", "status": "active", "bio": "", "photo_url": "", "is_verified": 0,
                     "referral_code": referral_code, "founder_badge": founder_badge}
        }
    finally:
        conn.close()


# ── Login ─────────────────────────────────────────────────────────────────────
@router.post("/api/auth/login")
@router.post("/api/login")
def login(data: LoginIn, request: Request):
    _check_login_rate(request.client.host if request.client else "unknown")
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT * FROM users WHERE email=?", [data.email.lower()])).fetchone()
        if not row:
            raise HTTPException(401, "Email ou mot de passe incorrect")
        m = dict(row._mapping)
        if not verify_password(data.password, m["password_hash"]):
            raise HTTPException(401, "Email ou mot de passe incorrect")
        if _needs_rehash(m["password_hash"]):
            new_hash = hash_password(data.password)
            conn.execute(*sql_params("UPDATE users SET password_hash=? WHERE id=?", [new_hash, m["id"]]))
            conn.commit()
        status = m.get("status", "active") or "active"
        if status == "suspended":
            raise HTTPException(403, "Votre compte a été suspendu. Contactez le support.")
        token = create_token(m["id"], m["email"])
        user_keys = ("id", "prenom", "nom", "email", "role", "ville", "tel")
        user_data = {k: m[k] for k in user_keys}
        for extra in ("status", "bio", "photo_url", "is_verified", "referral_code"):
            user_data[extra] = m.get(extra, "active" if extra == "status" else "") or ("active" if extra == "status" else "")
        fb = conn.execute(*sql_params("SELECT badge_number FROM founder_badges WHERE user_id=?", [m["id"]])).fetchone()
        user_data["founder_badge"] = fb[0] if fb else None
        resp = JSONResponse({"token": token, "user": user_data})
        resp.set_cookie(
            key="sl_auth", value=token,
            httponly=True, secure=(_ENV == "prod"),
            samesite="lax", max_age=24 * 3600,
            path="/"
        )
        return resp
    finally:
        conn.close()


# ── Logout ────────────────────────────────────────────────────────────────────
@router.post("/api/auth/logout")
@router.post("/api/logout")
def logout(request: Request, user: dict = Depends(get_current_user)):
    auth = request.headers.get("Authorization", "")
    if not auth:
        cookie_token = request.cookies.get("sl_auth", "")
        if cookie_token:
            auth = "Bearer " + cookie_token
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if token:
        th = _token_hash(token)
        conn = get_db()
        try:
            conn.execute(*sql_params("INSERT OR IGNORE INTO revoked_tokens (token_hash, revoked_at) VALUES (?,?)", [th, now_iso()]))
            import time as _t
            conn.execute(text("DELETE FROM revoked_tokens WHERE revoked_at < :cutoff"), {"cutoff": __import__('datetime').datetime.utcfromtimestamp(_t.time() - 48*3600).isoformat()})
            conn.commit()
        finally:
            conn.close()
    response = JSONResponse({"ok": True})
    response.delete_cookie("sl_auth", path="/")
    return response


# ── /api/me ───────────────────────────────────────────────────────────────────
@router.get("/api/me")
def get_me(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params(
            "SELECT id,prenom,nom,email,role,ville,plan,tel,bio,photo_url,is_verified,"
            "mre_country,mre_verified,mre_document,"
            "ice,cnss,rc,rib,company_name,company_address,"
            "arc_badge,arc_number "
            "FROM users WHERE id=?", [user["sub"]]
        )).fetchone()
        if not row:
            raise HTTPException(404, "Utilisateur non trouvé")
        return dict(row._mapping)
    finally:
        conn.close()


@router.delete("/api/me")
def delete_my_account(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        uid_v = user["sub"]
        anon = "deleted_" + uid_v[:8]
        conn.execute(*sql_params("UPDATE users SET email=?, prenom='Utilisateur', nom='Supprimé', tel='', bio='', photo_url='', referral_code='' WHERE id=?", [anon + "@deleted.local", uid_v]))
        conn.execute(*sql_params("DELETE FROM photos WHERE user_id=?", [uid_v]))
        conn.execute(*sql_params("DELETE FROM expenses WHERE user_id=?", [uid_v]))
        conn.execute(*sql_params("DELETE FROM projects WHERE user_id=?", [uid_v]))
        conn.execute(*sql_params("DELETE FROM agent_audit_log WHERE user_id=?", [uid_v]))
        conn.execute(*sql_params("DELETE FROM user_chats WHERE sender_id=? OR recipient_id=?", [uid_v, uid_v]))
        conn.execute(*sql_params("DELETE FROM community_posts WHERE user_id=?", [uid_v]))
        conn.execute(*sql_params("DELETE FROM project_briefs WHERE user_id=?", [uid_v]))
        conn.commit()
        return {"ok": True, "message": "Votre compte et vos données ont été supprimés conformément au RGPD (Loi 09-08)."}
    finally:
        conn.close()


@router.get("/api/me/export")
def export_my_data(user: dict = Depends(get_current_user)):
    from core import decrypt_gps
    from fastapi.responses import JSONResponse as _JR
    conn = get_db()
    try:
        uid_v = user["sub"]
        profile = dict(conn.execute(*sql_params("SELECT id,prenom,nom,email,role,ville,tel,bio,created_at FROM users WHERE id=?", [uid_v])).fetchone()._mapping)
        projects = [dict(r._mapping) for r in conn.execute(*sql_params("SELECT * FROM projects WHERE user_id=? ORDER BY created_at", [uid_v])).fetchall()]
        expenses = [dict(r._mapping) for r in conn.execute(*sql_params("SELECT * FROM expenses WHERE user_id=? AND deleted=0 ORDER BY date", [uid_v])).fetchall()]
        photos = [dict(r._mapping) for r in conn.execute(*sql_params("SELECT id,description,phase,date,created_at FROM photos WHERE user_id=?", [uid_v])).fetchall()]
        for p in photos:
            p["gps"] = decrypt_gps(p.get("gps") or "")
        messages_sent = [dict(r._mapping) for r in conn.execute(*sql_params("SELECT content,created_at FROM user_chats WHERE sender_id=? ORDER BY created_at", [uid_v])).fetchall()]
        export = {
            "export_date": now_iso(),
            "profile": profile,
            "projects": projects,
            "expenses": expenses,
            "photos": photos,
            "messages_sent_count": len(messages_sent),
            "messages_sent": messages_sent,
        }
        return _JR(content=export, headers={"Content-Disposition": "attachment; filename=shantilink_mes_donnees.json"})
    finally:
        conn.close()


# ── MRE ───────────────────────────────────────────────────────────────────────
@router.post("/api/me/mre-verify")
def mre_verify(data: MreVerifyIn, user: dict = Depends(get_current_user)):
    allowed_countries = ["France","Espagne","Italie","Belgique","Pays-Bas","Allemagne","Canada","USA","UK","Suisse","Autres"]
    if data.country not in allowed_countries:
        raise HTTPException(400, "Pays non reconnu")
    conn = get_db()
    try:
        conn.execute(*sql_params(
            "UPDATE users SET mre_country=?, mre_document=?, mre_verified=0 WHERE id=?",
            [data.country, data.document_type, user["sub"]]
        ))
        log_activity(conn, user["sub"], f"Demande de vérification MRE — {data.country}")
        conn.commit()
        return {"ok": True, "message": "Votre déclaration MRE a été enregistrée. La vérification sera effectuée sous 48h."}
    finally:
        conn.close()


@router.get("/api/me/mre-status")
def mre_status(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT mre_country, mre_verified, mre_document FROM users WHERE id=?", [user["sub"]])).fetchone()
        if not row:
            raise HTTPException(404, "Utilisateur non trouvé")
        d = dict(row._mapping)
        return {"mre_country": d.get("mre_country",""), "mre_verified": bool(d.get("mre_verified",0)), "mre_document": d.get("mre_document","")}
    finally:
        conn.close()


# ── Company profile ───────────────────────────────────────────────────────────
@router.patch("/api/me/company")
def update_company_profile(data: dict = Body(...), user: dict = Depends(get_current_user)):
    allowed = ["ice","cnss","rc","rib","company_name","company_address"]
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "No valid fields")
    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    updates["uid"] = user["sub"]
    conn = get_db()
    try:
        conn.execute(text(f"UPDATE users SET {set_clause} WHERE id=:uid"), updates)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── Profile (public endpoints) ────────────────────────────────────────────────
@router.get("/api/profile")
def get_profile(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(
            *sql_params("SELECT id,prenom,nom,email,role,ville,tel,bio,photo_url,is_verified,referral_code,plan,plan_expires,created_at FROM users WHERE id=?", [user["sub"]])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Utilisateur non trouvé")
        data_out = dict(row._mapping)
        fb = conn.execute(*sql_params("SELECT badge_number FROM founder_badges WHERE user_id=?", [user["sub"]])).fetchone()
        data_out["founder_badge"] = fb[0] if fb else None
        ref_count = conn.execute(*sql_params("SELECT COUNT(*) FROM referrals WHERE referrer_id=? AND status='completed'", [user["sub"]])).fetchone()[0]
        data_out["referral_count"] = ref_count
        plan = data_out.get("plan") or "starter"
        data_out["plan"] = plan
        data_out["plan_limits"] = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])
        proj_count = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
        data_out["usage"] = {"projects": proj_count}
        return data_out
    finally:
        conn.close()


@router.put("/api/profile")
def update_profile(data: ProfileIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        updates, params = [], []
        for field, val in [("prenom", data.prenom), ("nom", data.nom), ("ville", data.ville), ("tel", data.tel), ("bio", data.bio)]:
            if val is not None:
                updates.append(f"{field}=?"); params.append(val)
        if updates:
            params.append(user["sub"])
            conn.execute(*sql_params(f"UPDATE users SET {','.join(updates)} WHERE id=?", params))
            conn.commit()
        row = conn.execute(
            *sql_params("SELECT id,prenom,nom,email,role,ville,tel,bio,photo_url,is_verified,referral_code FROM users WHERE id=?", [user["sub"]])
        ).fetchone()
        return dict(row._mapping)
    finally:
        conn.close()


# ── Referrals ─────────────────────────────────────────────────────────────────
@router.get("/api/referrals")
def get_referrals(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM referrals WHERE referrer_id=? ORDER BY created_at DESC", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


# ── Plan endpoints ────────────────────────────────────────────────────────────
@router.get("/api/plan/status")
def plan_status(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT plan, plan_expires FROM users WHERE id=?", [user["sub"]])).fetchone()
        rm = dict(row._mapping) if row else {}
        plan = (rm.get("plan") or "starter")
        expires = (rm.get("plan_expires") or "")
        proj_count = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])
        from core import PLAN_PRICES
        return {
            "plan": plan,
            "plan_expires": expires,
            "limits": limits,
            "price": PLAN_PRICES.get(plan, 0),
            "usage": {"projects": proj_count},
        }
    finally:
        conn.close()


@router.post("/api/plan/trial")
def activate_trial(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT plan, plan_expires FROM users WHERE id=?", [user["sub"]])).fetchone()
        if not row:
            raise HTTPException(404, "Utilisateur non trouvé")
        rm = dict(row._mapping)
        plan = rm.get("plan") or "starter"
        if plan != "starter":
            raise HTTPException(400, "Essai disponible uniquement depuis le plan Starter")
        expires = rm.get("plan_expires") or ""
        if expires:
            raise HTTPException(400, "Vous avez déjà utilisé votre essai gratuit")
        from datetime import timedelta
        trial_end = (datetime.utcnow() + timedelta(days=30)).isoformat()
        conn.execute(*sql_params("UPDATE users SET plan='pro', plan_expires=? WHERE id=?", [trial_end, user["sub"]]))
        log_activity(conn, user["sub"], "Essai Pro 30 jours activé")
        conn.commit()
        return {"ok": True, "plan": "pro", "plan_expires": trial_end, "message": "Essai Pro 30 jours activé !"}
    finally:
        conn.close()


# ── Bootstrap (dev only) ──────────────────────────────────────────────────────
@router.post("/bootstrap/admin")
@router.post("/api/bootstrap")
def bootstrap_admin(body: dict = Body(...)):
    if _ENV == "prod":
        raise HTTPException(404, "Not found")
    secret = os.environ.get("BOOTSTRAP_SECRET", "")
    if secret and body.get("secret") != secret:
        raise HTTPException(403, "Clé invalide")
    conn = get_db()
    try:
        existing = conn.execute(text("SELECT id FROM users WHERE role='admin' LIMIT 1")).fetchone()
        if existing:
            raise HTTPException(400, "Admin déjà existant")
        pwd = body.get("password", "")
        if not pwd or len(pwd) < 8:
            raise HTTPException(400, "Mot de passe admin minimum 8 caractères")
        uid_val = "admin-" + uid()
        hashed = hash_password(pwd)
        email = body.get("email", "admin@shantilink.ma").lower()
        prenom = body.get("prenom", "Admin")
        nom = body.get("nom", "ShantiLink")
        conn.execute(*sql_params(
            "INSERT INTO users (id,prenom,nom,email,password_hash,role,ville,referral_code,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [uid_val, prenom, nom, email, hashed, "admin", "Casablanca", "SLADMIN", now_iso()]
        ))
        conn.commit()
        token = create_token(uid_val, email)
        return {"ok": True, "token": token, "email": email, "id": uid_val}
    finally:
        conn.close()


@router.post("/bootstrap/reset-admin")
def bootstrap_reset_admin(body: dict = Body(...)):
    if _ENV == "prod":
        raise HTTPException(404, "Not found")
    secret = os.environ.get("BOOTSTRAP_SECRET", "")
    if secret and body.get("secret") != secret:
        raise HTTPException(403, "Clé invalide")
    pwd = body.get("password")
    if not pwd or len(pwd) < 8:
        raise HTTPException(400, "Mot de passe trop court (min 8 caractères)")
    conn = get_db()
    try:
        row = conn.execute(text("SELECT id, email FROM users WHERE role='admin' LIMIT 1")).fetchone()
        if not row:
            raise HTTPException(404, "Aucun admin trouvé")
        hashed = hash_password(pwd)
        conn.execute(*sql_params("UPDATE users SET password_hash=? WHERE id=?", [hashed, row[0]]))
        conn.commit()
        return {"ok": True, "email": row[1], "message": "Mot de passe réinitialisé"}
    finally:
        conn.close()
