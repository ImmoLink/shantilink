"""
routers/professionals.py — Catalogue professionnels, messages pro, activités.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from core import get_db, sql_params, uid, now_iso, get_current_user

router = APIRouter(tags=["professionals"])


def _mask_tel(tel: str) -> str:
    """CMP-04: Masquer partiellement le numéro pour les non-connectés."""
    if not tel or len(tel) < 8:
        return tel
    return tel[:6] + "•• •• " + tel[-2:]


@router.get("/api/professionals")
def get_professionals(
    request: Request,
    role: Optional[str] = None,
    ville: Optional[str] = None,
    search: Optional[str] = None
):
    auth = request.headers.get("Authorization", "")
    is_authenticated = bool(auth.startswith("Bearer ") and auth[7:])
    conn = get_db()
    try:
        q = "SELECT * FROM professionals WHERE 1=1"
        params = []
        if role:
            q += " AND role=?"; params.append(role)
        if ville:
            q += " AND ville=?"; params.append(ville)
        if search:
            q += " AND (nom LIKE ? OR description LIKE ?)"; params += [f"%{search}%", f"%{search}%"]
        rows = conn.execute(*sql_params(q, params)).fetchall()
        result = []
        for r in rows:
            d = dict(r._mapping)
            if not is_authenticated:
                d["tel"] = _mask_tel(d.get("tel", ""))
            result.append(d)
        return result
    finally:
        conn.close()


# ── Messages pro ──────────────────────────────────────────────────────────────
class MessageIn(BaseModel):
    professional_id: int
    content: str


@router.get("/api/messages")
def get_all_conversations(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(*sql_params("""
            SELECT m.professional_id, p.nom, p.emoji, p.role, p.ville,
                   MAX(m.created_at) as last_at,
                   (SELECT content FROM messages WHERE user_id=? AND professional_id=m.professional_id ORDER BY created_at DESC LIMIT 1) as last_msg
            FROM messages m
            JOIN professionals p ON p.id = m.professional_id
            WHERE m.user_id=?
            GROUP BY m.professional_id
            ORDER BY last_at DESC
        """, [user["sub"], user["sub"]])).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.get("/api/messages/{pro_id}")
def get_conversation(pro_id: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM messages WHERE user_id=? AND professional_id=? ORDER BY created_at ASC", [user["sub"], pro_id])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.post("/api/messages")
def send_message(data: MessageIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        pro = conn.execute(*sql_params("SELECT * FROM professionals WHERE id=?", [data.professional_id])).fetchone()
        if not pro:
            raise HTTPException(404, "Professionnel non trouvé")
        mid = "m" + uid()
        conn.execute(*sql_params(
            "INSERT INTO messages (id,user_id,professional_id,content,from_user,created_at) VALUES (?,?,?,?,1,?)",
            [mid, user["sub"], data.professional_id, data.content, now_iso()]
        ))
        conn.commit()
        rows = conn.execute(
            *sql_params("SELECT * FROM messages WHERE user_id=? AND professional_id=? ORDER BY created_at ASC", [user["sub"], data.professional_id])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


# ── Activities ────────────────────────────────────────────────────────────────
@router.get("/api/activities")
def get_activities(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM activities WHERE user_id=? ORDER BY created_at DESC LIMIT 20", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()
