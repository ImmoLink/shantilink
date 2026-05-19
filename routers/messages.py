"""
routers/messages.py — User-to-user chat (DMs).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import get_db, sql_params, uid, now_iso, get_current_user

router = APIRouter(tags=["messages"])


class ChatMessageIn(BaseModel):
    content: str


@router.get("/api/chat")
def list_chats(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        uid_v = user["sub"]
        rows = conn.execute(*sql_params("""
            WITH base AS (
                SELECT id, sender_id, recipient_id, content, created_at, read_at,
                       CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END AS other_id
                FROM user_chats
                WHERE sender_id=? OR recipient_id=?
            )
            SELECT
                b.other_id,
                u.prenom, u.nom, u.role, u.ville, u.photo_url,
                MAX(b.created_at) AS last_at,
                (SELECT b2.content FROM base b2 WHERE b2.other_id=b.other_id
                 ORDER BY b2.created_at DESC LIMIT 1) AS last_msg,
                SUM(CASE WHEN b.recipient_id=? AND (b.read_at IS NULL OR b.read_at='')
                    THEN 1 ELSE 0 END) AS unread
            FROM base b
            JOIN users u ON u.id = b.other_id
            GROUP BY b.other_id, u.prenom, u.nom, u.role, u.ville, u.photo_url
            ORDER BY last_at DESC
        """, [uid_v, uid_v, uid_v, uid_v])).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.get("/api/chat/{other_id}")
def get_chat(other_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        other = conn.execute(*sql_params("SELECT id,prenom,nom,role,ville,photo_url FROM users WHERE id=?", [other_id])).fetchone()
        if not other:
            raise HTTPException(404, "Utilisateur non trouvé")
        rows = conn.execute(*sql_params("""
            SELECT * FROM user_chats
            WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)
            ORDER BY created_at ASC
        """, [user["sub"], other_id, other_id, user["sub"]])).fetchall()
        conn.execute(*sql_params(
            "UPDATE user_chats SET read_at=? WHERE sender_id=? AND recipient_id=? AND (read_at IS NULL OR read_at='')",
            [now_iso(), other_id, user["sub"]]
        ))
        conn.commit()
        return {
            "other": dict(other._mapping),
            "messages": [dict(r._mapping) for r in rows]
        }
    finally:
        conn.close()


@router.post("/api/chat/{other_id}", status_code=201)
def send_chat(other_id: str, data: ChatMessageIn, user: dict = Depends(get_current_user)):
    if not data.content or not data.content.strip():
        raise HTTPException(400, "Le message ne peut pas être vide")
    if other_id == user["sub"]:
        raise HTTPException(400, "Vous ne pouvez pas vous envoyer un message")
    conn = get_db()
    try:
        other = conn.execute(*sql_params("SELECT id FROM users WHERE id=?", [other_id])).fetchone()
        if not other:
            raise HTTPException(404, "Destinataire non trouvé")
        mid = "uc" + uid()
        conn.execute(*sql_params(
            "INSERT INTO user_chats (id,sender_id,recipient_id,content,created_at) VALUES (?,?,?,?,?)",
            [mid, user["sub"], other_id, data.content.strip()[:2000], now_iso()]
        ))
        conn.commit()
        return {"ok": True, "id": mid, "created_at": now_iso()}
    finally:
        conn.close()
