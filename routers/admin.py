"""
routers/admin.py — Routes admin (purge, verify, users list, posts management).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import text

from core import get_db, sql_params, uid, now_iso, require_admin

router = APIRouter(tags=["admin"])


@router.get("/api/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    conn = get_db()
    try:
        today = now_iso()[:10]
        total_users    = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
        new_today      = conn.execute(*sql_params("SELECT COUNT(*) FROM users WHERE created_at >= ?", [today])).fetchone()[0]
        total_projects = conn.execute(text("SELECT COUNT(*) FROM projects")).fetchone()[0]
        total_expenses = conn.execute(text("SELECT COALESCE(SUM(montant),0) FROM expenses WHERE deleted=0")).fetchone()[0]
        total_posts    = conn.execute(text("SELECT COUNT(*) FROM community_posts")).fetchone()[0]
        return {
            "total_users": total_users,
            "new_users_today": new_today,
            "total_projects": total_projects,
            "total_expenses": float(total_expenses),
            "total_posts": total_posts,
        }
    finally:
        conn.close()


@router.get("/api/admin/users")
def admin_list_users(skip: int = 0, limit: int = 50, admin=Depends(require_admin)):
    conn = get_db()
    try:
        rows = conn.execute(*sql_params("""
            SELECT u.id, u.prenom, u.nom, u.email, u.role, u.ville, u.plan, u.created_at, u.status,
                   (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) as nb_projects,
                   (SELECT COALESCE(SUM(e.montant),0) FROM expenses e WHERE e.user_id = u.id AND e.deleted=0) as total_expenses
            FROM users u
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        """, [limit, skip])).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.put("/api/admin/users/{user_id}/role")
def admin_update_role(user_id: str, body: dict, admin=Depends(require_admin)):
    conn = get_db()
    try:
        new_role = body.get("role", "client")
        if new_role not in ["client","pro","admin","promoteur","architecte","comptable","bureau","notaire","electricien","plombier","autre"]:
            raise HTTPException(400, "Rôle invalide")
        conn.execute(*sql_params("UPDATE users SET role=? WHERE id=?", [new_role, user_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, admin=Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute(*sql_params("DELETE FROM users WHERE id=?", [user_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.put("/api/admin/posts/{post_id}/pin")
def admin_pin_post(post_id: str, body: dict, admin=Depends(require_admin)):
    conn = get_db()
    try:
        val = 1 if body.get("pin") else 0
        conn.execute(*sql_params("UPDATE community_posts SET est_epingle=? WHERE id=?", [val, post_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.patch("/api/admin/posts/{post_id}")
def admin_update_post(post_id: str, body: dict, admin=Depends(require_admin)):
    conn = get_db()
    try:
        fields, vals = [], []
        for col in ("titre", "content", "tags", "media_url", "media_urls", "est_epingle"):
            if col in body:
                fields.append(col + "=?")
                vals.append(body[col])
        if not fields:
            raise HTTPException(400, "Aucun champ à mettre à jour")
        vals.append(post_id)
        conn.execute(*sql_params(f"UPDATE community_posts SET {', '.join(fields)} WHERE id=?", vals))
        conn.commit()
        return {"ok": True, "post_id": post_id}
    finally:
        conn.close()


@router.delete("/api/admin/posts/{post_id}")
def admin_delete_post(post_id: str, admin=Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute(*sql_params("DELETE FROM community_posts WHERE id=?", [post_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/api/admin/purge-audit-log")
def purge_audit_log(admin=Depends(require_admin)):
    cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat()
    conn = get_db()
    try:
        r = conn.execute(*sql_params("DELETE FROM agent_audit_log WHERE created_at < ?", [cutoff]))
        conn.commit()
        return {"ok": True, "deleted": r.rowcount, "cutoff": cutoff}
    finally:
        conn.close()


@router.post("/api/admin/verify-architect")
def verify_architect(data: dict = Body(...), admin: dict = Depends(require_admin)):
    uid_v = data.get("user_id")
    badge = data.get("action", "verify")
    pro_id = data.get("pro_id")
    conn = get_db()
    try:
        if badge == "verify":
            conn.execute(text("UPDATE users SET arc_badge='verified' WHERE id=:uid"), {"uid": uid_v})
            if pro_id:
                conn.execute(text("UPDATE professionals SET arc_badge='verified' WHERE id=:pid"), {"pid": pro_id})
        else:
            conn.execute(text("UPDATE users SET arc_badge=NULL WHERE id=:uid"), {"uid": uid_v})
            if pro_id:
                conn.execute(text("UPDATE professionals SET arc_badge=NULL WHERE id=:pid"), {"pid": pro_id})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
