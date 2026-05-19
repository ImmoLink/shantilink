"""
routers/promoter.py — Équipe promoteur et programmes immobiliers.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import text

from core import get_db, sql_params, get_current_user

router = APIRouter(tags=["promoter"])


# ── PRM-01: Gestion équipe ────────────────────────────────────────────────────
@router.post("/api/team/invite")
def invite_team_member(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user.get("role") != "promoteur":
        raise HTTPException(403, "Réservé aux promoteurs")
    email = data.get("member_email", "").strip().lower()
    role = data.get("role", "viewer")
    if not email or "@" not in email:
        raise HTTPException(400, "Email invalide")
    conn = get_db()
    try:
        conn.execute(text(
            "INSERT INTO promoter_team (promoter_id,member_email,role,invited_at) VALUES (:uid,:email,:role,datetime('now'))"
        ), {"uid": user["sub"], "email": email, "role": role})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/api/team")
def get_team(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            text("SELECT id,member_email,role,invited_at FROM promoter_team WHERE promoter_id=:uid ORDER BY invited_at DESC"),
            {"uid": user["sub"]}
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.delete("/api/team/{tid}")
def remove_team_member(tid: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(text("SELECT promoter_id FROM promoter_team WHERE id=:tid"), {"tid": tid}).fetchone()
        if not row:
            raise HTTPException(404, "Membre non trouvé")
        if row[0] != user["sub"]:
            raise HTTPException(403, "Non autorisé")
        conn.execute(text("DELETE FROM promoter_team WHERE id=:tid"), {"tid": tid})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── PRM-02: Programmes ────────────────────────────────────────────────────────
@router.post("/api/programmes", status_code=201)
def create_programme(data: dict = Body(...), user: dict = Depends(get_current_user)):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Nom requis")
    conn = get_db()
    try:
        result = conn.execute(text(
            "INSERT INTO programmes (promoter_id,name,description,created_at) VALUES (:uid,:name,:desc,datetime('now'))"
        ), {"uid": user["sub"], "name": name, "desc": data.get("description", "")})
        conn.commit()
        return {"ok": True, "id": result.lastrowid}
    finally:
        conn.close()


@router.get("/api/programmes")
def get_programmes(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            text("SELECT id,name,description,created_at FROM programmes WHERE promoter_id=:uid ORDER BY created_at DESC"),
            {"uid": user["sub"]}
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.patch("/api/programmes/{pid}")
def update_programme(pid: int, data: dict = Body(...), user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(text("SELECT promoter_id FROM programmes WHERE id=:pid"), {"pid": pid}).fetchone()
        if not row or row[0] != user["sub"]:
            raise HTTPException(404, "Programme non trouvé")
        allowed = ["name", "description"]
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            raise HTTPException(400, "Aucun champ valide")
        set_clause = ", ".join(f"{k}=:{k}" for k in updates)
        updates["pid"] = pid
        conn.execute(text(f"UPDATE programmes SET {set_clause} WHERE id=:pid"), updates)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/api/programmes/{pid}")
def delete_programme(pid: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(text("SELECT promoter_id FROM programmes WHERE id=:pid"), {"pid": pid}).fetchone()
        if not row or row[0] != user["sub"]:
            raise HTTPException(404, "Programme non trouvé")
        conn.execute(text("DELETE FROM programmes WHERE id=:pid"), {"pid": pid})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── PRM-04: ROI promoteur ─────────────────────────────────────────────────────
@router.get("/api/promoter/roi")
def get_promoter_roi(user: dict = Depends(get_current_user)):
    if user.get("role") != "promoteur":
        raise HTTPException(403, "Réservé aux promoteurs")
    conn = get_db()
    try:
        uid_v = user["sub"]
        projects = conn.execute(*sql_params("SELECT id, budget FROM projects WHERE user_id=? AND deleted=0", [uid_v])).fetchall()
        pids = [p[0] for p in projects]
        total_budget = sum(p[1] or 0 for p in projects)
        total_expenses = 0
        if pids:
            placeholders = ",".join("?" * len(pids))
            exp = conn.execute(*sql_params(f"SELECT COALESCE(SUM(montant),0) as s FROM expenses WHERE project_id IN ({placeholders}) AND deleted=0", list(pids))).fetchone()
            total_expenses = exp[0] or 0
        nb_active_briefs = 0
        if pids:
            placeholders = ",".join("?" * len(pids))
            nb_active_briefs = conn.execute(*sql_params(f"SELECT COUNT(*) FROM project_briefs WHERE project_id IN ({placeholders}) AND status='open'", list(pids))).fetchone()[0] or 0
        return {
            "nb_projects": len(pids),
            "total_budget": total_budget,
            "total_expenses": total_expenses,
            "roi_ratio": round((total_budget - total_expenses) / total_budget * 100, 1) if total_budget else 0,
            "nb_active_briefs": nb_active_briefs,
        }
    finally:
        conn.close()
