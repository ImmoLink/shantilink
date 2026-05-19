"""
routers/notifications.py — Notifications in-app.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text

from core import get_db, get_current_user

router = APIRouter(tags=["notifications"])


@router.get("/api/notifications")
def get_notifications(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            text("SELECT id,type,title,body,link,read,created_at FROM notifications WHERE user_id=:uid ORDER BY created_at DESC LIMIT 50"),
            {"uid": user["sub"]}
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.post("/api/notifications/{nid}/read")
def mark_notification_read(nid: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        conn.execute(text("UPDATE notifications SET read=1 WHERE id=:nid AND user_id=:uid"), {"nid": nid, "uid": user["sub"]})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/api/notifications/read-all")
def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        conn.execute(text("UPDATE notifications SET read=1 WHERE user_id=:uid"), {"uid": user["sub"]})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
