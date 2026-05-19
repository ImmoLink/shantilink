"""
routers/misc.py — /health, /ping, /api/stats, /api/contact, /api/exchange-rate, etc.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from core import get_db, sql_params, uid, now_iso, _is_sqlite
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ContactIn(BaseModel):
    prenom: Optional[str] = ""
    nom: Optional[str] = ""
    email: str
    role: Optional[str] = ""
    message: str


@router.get("/ping")
def ping():
    return {"ok": True}


@router.get("/api/ping")
def api_ping():
    return {"ok": True}


@router.get("/health")
def health():
    try:
        conn = get_db()
        conn.execute(text("SELECT 1"))
        conn.close()
        db_type = "postgresql" if not _is_sqlite else "sqlite"
        return {"status": "ok", "db": db_type}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/api/stats")
def get_stats():
    conn = get_db()
    try:
        users = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
        projects = conn.execute(text("SELECT COUNT(*) FROM projects")).fetchone()[0]
        return {"users": users, "projects": projects, "pros": 15, "villes": 12}
    finally:
        conn.close()


@router.get("/api/stats/platform")
def platform_stats():
    conn = get_db()
    try:
        pro_count = conn.execute(text("SELECT COUNT(*) FROM professionals")).fetchone()[0]
        project_count = conn.execute(text("SELECT COUNT(*) FROM projects")).fetchone()[0]
        user_count = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
        city_count = conn.execute(text("SELECT COUNT(DISTINCT ville) FROM professionals WHERE ville!=''")).fetchone()[0]
        return {
            "pros": pro_count,
            "projects": project_count,
            "users": user_count,
            "cities": city_count
        }
    finally:
        conn.close()


@router.post("/api/contact")
def submit_contact(data: ContactIn):
    conn = get_db()
    try:
        conn.execute(*sql_params(
            "INSERT INTO contacts (id,prenom,nom,email,role,message,created_at) VALUES (?,?,?,?,?,?,?)",
            ["c" + uid(), data.prenom, data.nom, data.email, data.role, data.message, now_iso()]
        ))
        conn.commit()
        return {"ok": True, "message": "Message envoyé ! Réponse sous 24h."}
    finally:
        conn.close()
