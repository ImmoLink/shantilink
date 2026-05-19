"""
routers/projects.py — CRUD projects, briefs, brief_responses, documents, partage.
"""
import os
import json
import base64

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Body
from fastapi.responses import JSONResponse
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from core import (
    get_db, sql_params, uid, now_iso,
    get_current_user, log_activity,
    UPLOADS_DIR, _CLOUDINARY_OK, PLAN_LIMITS
)

router = APIRouter(tags=["projects"])


# ── Pydantic models ───────────────────────────────────────────────────────────
class ProjectIn(BaseModel):
    nom: str
    ville: Optional[str] = ""
    budget: Optional[int] = 0
    type: Optional[str] = "Villa / Maison individuelle"
    etages: Optional[int] = 0
    description: Optional[str] = ""


class PctIn(BaseModel):
    pct: int


class PhasesIn(BaseModel):
    phases: str  # JSON string


class BriefIn(BaseModel):
    titre: str
    description: Optional[str] = ""
    ville: Optional[str] = ""
    categorie: Optional[str] = "entrepreneur"
    budget_min: Optional[int] = 0
    budget_max: Optional[int] = 0
    deadline: Optional[str] = ""
    brief_type: Optional[str] = "demand"


class BriefResponseIn(BaseModel):
    message: str
    prix: Optional[int] = 0
    delai: Optional[str] = ""
    conditions: Optional[str] = ""
    phases: Optional[List[Dict[str, Any]]] = None


class ReviewIn(BaseModel):
    pro_user_id: Optional[str] = ""
    pro_catalog_id: Optional[int] = 0
    project_id: Optional[str] = ""
    rating: int
    comment: Optional[str] = ""


# ── Projects CRUD ─────────────────────────────────────────────────────────────
@router.get("/api/projects")
def get_projects(user: dict = Depends(get_current_user), limit: int = 50, offset: int = 0):
    conn = get_db()
    try:
        total = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
        rows = conn.execute(
            *sql_params("SELECT * FROM projects WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?", [user["sub"], limit, offset])
        ).fetchall()
        result = [dict(r._mapping) for r in rows]
        resp = JSONResponse(content=result)
        resp.headers["X-Total-Count"] = str(total)
        return resp
    finally:
        conn.close()


@router.post("/api/projects", status_code=201)
def create_project(data: ProjectIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        plan_r = conn.execute(*sql_params("SELECT plan FROM users WHERE id=?", [user["sub"]])).fetchone()
        plan = (plan_r[0] or "starter") if plan_r else "starter"
        if plan == "starter":
            n = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
            if n >= 3:
                raise HTTPException(403, "PLAN_LIMIT:Vous avez atteint la limite de 3 chantiers (plan Starter). Passez à Pro pour des chantiers illimités.")
        pid = "p" + uid()
        conn.execute(*sql_params(
            "INSERT INTO projects (id,user_id,nom,ville,budget,type,etages,description,pct,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)",
            [pid, user["sub"], data.nom, data.ville, data.budget, data.type, data.etages or 0, data.description, now_iso()]
        ))
        log_activity(conn, user["sub"], f"Nouveau projet créé : {data.nom}")
        conn.commit()
        row = conn.execute(*sql_params("SELECT * FROM projects WHERE id=?", [pid])).fetchone()
        return dict(row._mapping)
    finally:
        conn.close()


@router.put("/api/projects/{pid}")
def update_project(pid: str, data: ProjectIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        conn.execute(*sql_params(
            "UPDATE projects SET nom=?,ville=?,budget=?,type=?,etages=?,description=? WHERE id=?",
            [data.nom, data.ville, data.budget, data.type, data.etages or 0, data.description, pid]
        ))
        conn.commit()
        return dict(conn.execute(*sql_params("SELECT * FROM projects WHERE id=?", [pid])).fetchone()._mapping)
    finally:
        conn.close()


@router.patch("/api/projects/{pid}/pct")
def update_pct(pid: str, data: PctIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        pct = max(0, min(100, data.pct))
        prev = conn.execute(*sql_params("SELECT pct FROM projects WHERE id=?", [pid])).fetchone()
        prev_pct = dict(prev._mapping)["pct"] if prev else 0
        conn.execute(*sql_params("UPDATE projects SET pct=? WHERE id=?", [pct, pid]))
        completed = pct >= 100 and (prev_pct or 0) < 100
        if completed:
            log_activity(conn, user["sub"], "Projet terminé à 100% — pensez à demander un avis à votre prestataire !")
            conn.execute(*sql_params("UPDATE projects SET status=? WHERE id=? AND (status IS NULL OR status='')", ["completed", pid]))
        conn.commit()
        return {"ok": True, "pct": pct, "just_completed": completed}
    finally:
        conn.close()


@router.patch("/api/projects/{pid}/phases")
def update_phases(pid: str, data: PhasesIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        conn.execute(*sql_params("UPDATE projects SET phases=? WHERE id=?", [data.phases, pid]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/api/projects/{pid}")
def delete_project(pid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        existing = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not existing:
            raise HTTPException(404, "Projet non trouvé")
        conn.execute(*sql_params("UPDATE expenses SET deleted=1 WHERE project_id=? AND user_id=?", [pid, user["sub"]]))
        conn.execute(*sql_params("DELETE FROM project_briefs WHERE project_id=?", [pid]))
        conn.execute(*sql_params("DELETE FROM brief_responses WHERE brief_id IN (SELECT id FROM project_briefs WHERE project_id=?)", [pid]))
        conn.execute(*sql_params("DELETE FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]]))
        log_activity(conn, user["sub"], "Projet supprimé")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── Share ─────────────────────────────────────────────────────────────────────
@router.post("/api/projects/{pid}/share")
def generate_share_link(pid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT * FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        share_token = base64.urlsafe_b64encode(os.urandom(18)).decode().rstrip("=")
        conn.execute(*sql_params("UPDATE projects SET share_token=? WHERE id=?", [share_token, pid]))
        conn.commit()
        return {"ok": True, "share_token": share_token, "share_url": f"/shared/{share_token}"}
    finally:
        conn.close()


@router.get("/api/shared/{share_token}")
def get_shared_project(share_token: str):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id,nom,type,ville,pct,budget,phases,created_at FROM projects WHERE share_token=? AND share_token!=''", [share_token])).fetchone()
        if not p:
            raise HTTPException(404, "Lien de partage invalide ou expiré")
        proj = dict(p._mapping)
        expenses = [dict(r._mapping) for r in conn.execute(
            *sql_params("SELECT categorie, montant, date FROM expenses WHERE project_id=? AND deleted=0 ORDER BY date DESC LIMIT 20", [proj["id"]])
        ).fetchall()]
        photos = [dict(r._mapping) for r in conn.execute(
            *sql_params("SELECT description, phase, date, image_url FROM photos WHERE user_id=(SELECT user_id FROM projects WHERE id=?) ORDER BY date DESC LIMIT 12", [proj["id"]])
        ).fetchall()]
        return {"project": proj, "expenses": expenses, "photos": photos}
    finally:
        conn.close()


# ── Programme assignment ──────────────────────────────────────────────────────
@router.patch("/api/projects/{pid}/programme")
def set_project_programme(pid: str, data: dict = Body(...), user: dict = Depends(get_current_user)):
    programme_id = data.get("programme_id")
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT user_id FROM projects WHERE id=?", [pid])).fetchone()
        if not row or row[0] != user["sub"]:
            raise HTTPException(404, "Projet non trouvé")
        conn.execute(*sql_params("UPDATE projects SET programme_id=? WHERE id=?", [programme_id, pid]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── Briefs ────────────────────────────────────────────────────────────────────
@router.post("/api/briefs", status_code=201)
def create_brief(data: BriefIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        bid = "b" + uid()
        brief_type = data.brief_type if data.brief_type in ("demand", "offer") else "demand"
        conn.execute(*sql_params(
            "INSERT INTO project_briefs (id,user_id,titre,description,ville,categorie,budget_min,budget_max,deadline,status,brief_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [bid, user["sub"], data.titre, data.description, data.ville, data.categorie,
             data.budget_min, data.budget_max, data.deadline, "open", brief_type, now_iso()]
        ))
        action = "Appel d'offres publié" if brief_type == "offer" else "Demande de devis publiée"
        log_activity(conn, user["sub"], f"{action} : {data.titre}")
        conn.commit()
        row = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [bid])).fetchone()
        return dict(row._mapping)
    finally:
        conn.close()


@router.get("/api/briefs")
def list_briefs(ville: Optional[str] = None, categorie: Optional[str] = None, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        query = "SELECT pb.*, u.prenom, u.nom FROM project_briefs pb JOIN users u ON pb.user_id=u.id WHERE pb.status='open'"
        params = []
        if ville:
            query += " AND pb.ville=?"; params.append(ville)
        if categorie:
            query += " AND pb.categorie=?"; params.append(categorie)
        query += " ORDER BY pb.created_at DESC LIMIT 50"
        rows = conn.execute(*sql_params(query, params)).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.get("/api/briefs/mine")
def my_briefs(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM project_briefs WHERE user_id=? ORDER BY created_at DESC", [user["sub"]])
        ).fetchall()
        result = []
        for r in rows:
            brief = dict(r._mapping)
            responses = conn.execute(
                *sql_params("SELECT br.*, u.prenom, u.nom, u.ville, u.tel FROM brief_responses br JOIN users u ON br.pro_user_id=u.id WHERE br.brief_id=? ORDER BY br.created_at DESC", [brief["id"]])
            ).fetchall()
            brief["responses"] = [dict(resp._mapping) for resp in responses]
            result.append(brief)
        return result
    finally:
        conn.close()


@router.post("/api/briefs/{brief_id}/respond", status_code=201)
def respond_brief(brief_id: str, data: BriefResponseIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        if not _br:
            raise HTTPException(404, "Demande non trouvée")
        brief = dict(_br._mapping)
        if brief["status"] != "open":
            raise HTTPException(400, "Cette demande est clôturée")
        existing = conn.execute(
            *sql_params("SELECT id FROM brief_responses WHERE brief_id=? AND pro_user_id=?", [brief_id, user["sub"]])
        ).fetchone()
        if existing:
            raise HTTPException(409, "Vous avez déjà répondu à cette demande")
        rid = "br" + uid()
        phases_json = json.dumps(data.phases) if data.phases else None
        conn.execute(*sql_params(
            "INSERT INTO brief_responses (id,brief_id,pro_user_id,message,prix,delai,conditions,phases,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [rid, brief_id, user["sub"], data.message, data.prix, data.delai, data.conditions or "", phases_json, "pending", now_iso()]
        ))
        log_activity(conn, user["sub"], f"Réponse envoyée pour la demande : {brief['titre']}")
        conn.commit()
        return {"ok": True, "id": rid}
    finally:
        conn.close()


@router.post("/api/briefs/{brief_id}/respond-rich", status_code=201)
async def respond_brief_rich(
    request: Request,
    brief_id: str,
    message: str = Form(...),
    prix: int = Form(0),
    delai: str = Form(""),
    conditions: str = Form(""),
    phases: str = Form(""),
    attachment: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        if not _br:
            raise HTTPException(404, "Demande non trouvée")
        brief = dict(_br._mapping)
        if brief["status"] != "open":
            raise HTTPException(400, "Cette demande est clôturée")
        existing = conn.execute(
            *sql_params("SELECT id FROM brief_responses WHERE brief_id=? AND pro_user_id=?", [brief_id, user["sub"]])
        ).fetchone()
        if existing:
            raise HTTPException(409, "Vous avez déjà répondu à cette demande")
        attachment_url = ""
        if attachment and attachment.filename:
            allowed_att = {".pdf", ".jpg", ".jpeg", ".png", ".docx"}
            ext = os.path.splitext(attachment.filename)[-1].lower()
            if ext not in allowed_att:
                raise HTTPException(400, "Format de pièce jointe non supporté")
            raw = await attachment.read()
            if len(raw) > 5 * 1024 * 1024:
                raise HTTPException(400, "Fichier trop volumineux (max 5 Mo)")
            att_name = "att_" + uid() + ext
            att_path = os.path.join(UPLOADS_DIR, att_name)
            with open(att_path, "wb") as f:
                f.write(raw)
            attachment_url = "/static/uploads/" + att_name
            if _CLOUDINARY_OK and ext != ".pdf":
                try:
                    import cloudinary.uploader as _cu
                    res = _cu.upload(att_path, folder="shantilink/attachments")
                    attachment_url = res.get("secure_url", attachment_url)
                    os.remove(att_path)
                except Exception as e:
                    pass
        rid = "br" + uid()
        phases_val = phases.strip() or None
        conn.execute(*sql_params(
            "INSERT INTO brief_responses (id,brief_id,pro_user_id,message,prix,delai,conditions,phases,attachment_url,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [rid, brief_id, user["sub"], message, prix, delai, conditions, phases_val, attachment_url, "pending", now_iso()]
        ))
        log_activity(conn, user["sub"], f"Réponse détaillée envoyée pour la demande : {brief['titre']}")
        conn.commit()
        return {"ok": True, "id": rid, "attachment_url": attachment_url}
    finally:
        conn.close()


@router.delete("/api/briefs/{brief_id}")
def delete_brief(brief_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        if not _br:
            raise HTTPException(404, "Demande non trouvée")
        brief = dict(_br._mapping)
        if brief["user_id"] != user["sub"]:
            raise HTTPException(403, "Non autorisé")
        conn.execute(*sql_params("DELETE FROM project_briefs WHERE id=?", [brief_id]))
        conn.execute(*sql_params("DELETE FROM brief_responses WHERE brief_id=?", [brief_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.patch("/api/briefs/{brief_id}/close")
def close_brief(brief_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        brief = dict(_br._mapping) if _br else None
        if not brief or brief["user_id"] != user["sub"]:
            raise HTTPException(403, "Non autorisé")
        conn.execute(*sql_params("UPDATE project_briefs SET status='closed' WHERE id=?", [brief_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.patch("/api/briefs/{brief_id}/responses/{resp_id}/status")
def update_brief_response_status(brief_id: str, resp_id: str, body: dict, user: dict = Depends(get_current_user)):
    new_status = body.get("status", "")
    allowed = {"sent", "seen", "quoted", "accepted", "rejected"}
    if new_status not in allowed:
        raise HTTPException(400, f"Statut invalide. Valeurs acceptées : {', '.join(allowed)}")
    conn = get_db()
    try:
        resp = conn.execute(*sql_params("SELECT br.*, pb.user_id as owner_id FROM brief_responses br JOIN project_briefs pb ON br.brief_id=pb.id WHERE br.id=? AND br.brief_id=?", [resp_id, brief_id])).fetchone()
        if not resp:
            raise HTTPException(404, "Réponse non trouvée")
        r = dict(resp._mapping)
        if user["sub"] != r["owner_id"] and user["sub"] != r["pro_user_id"]:
            raise HTTPException(403, "Non autorisé")
        conn.execute(*sql_params("UPDATE brief_responses SET status=? WHERE id=?", [new_status, resp_id]))
        conn.commit()
        return {"ok": True, "status": new_status}
    finally:
        conn.close()


# ── Reviews ───────────────────────────────────────────────────────────────────
@router.post("/api/reviews", status_code=201)
def create_review(data: ReviewIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        if not 1 <= data.rating <= 5:
            raise HTTPException(400, "Note entre 1 et 5")
        existing = conn.execute(
            *sql_params("SELECT id FROM pro_reviews WHERE reviewer_id=? AND pro_catalog_id=? AND pro_user_id=?",
                        [user["sub"], data.pro_catalog_id or 0, data.pro_user_id or ""])
        ).fetchone()
        if existing:
            raise HTTPException(409, "Vous avez déjà noté ce professionnel")
        rid = "rv" + uid()
        conn.execute(*sql_params(
            "INSERT INTO pro_reviews (id,reviewer_id,pro_user_id,pro_catalog_id,project_id,rating,comment,created_at) VALUES (?,?,?,?,?,?,?,?)",
            [rid, user["sub"], data.pro_user_id or "", data.pro_catalog_id or 0,
             data.project_id or "", data.rating, data.comment, now_iso()]
        ))
        conn.commit()
        return {"ok": True, "id": rid}
    finally:
        conn.close()


@router.get("/api/reviews/pro/{pro_id}")
def get_pro_reviews(pro_id: int):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT pr.*, u.prenom, u.nom FROM pro_reviews pr JOIN users u ON pr.reviewer_id=u.id WHERE pr.pro_catalog_id=? ORDER BY pr.created_at DESC", [pro_id])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


# ── Documents ─────────────────────────────────────────────────────────────────
@router.post("/api/projects/{pid}/documents")
async def upload_document(pid: str, file: UploadFile = File(...), category: str = Form(default="other"), user: dict = Depends(get_current_user)):
    ALLOWED = {"application/pdf","image/jpeg","image/png","image/webp","application/msword",
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    ct = file.content_type or ""
    if ct not in ALLOWED:
        raise HTTPException(400, "Format non supporté")
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 20MB)")
    if _CLOUDINARY_OK:
        try:
            import cloudinary.uploader
            result = cloudinary.uploader.upload(contents, folder=f"shantilink/docs/{user['sub']}", resource_type="raw" if ct == "application/pdf" else "image")
            url = result["secure_url"]
        except Exception as e:
            raise HTTPException(500, f"Erreur upload: {e}")
    else:
        ext = os.path.splitext(file.filename or "doc")[-1].lower() or ".bin"
        fname = "doc_" + uid() + ext
        dest = os.path.join(UPLOADS_DIR, fname)
        with open(dest, "wb") as f_out:
            f_out.write(contents)
        url = "/static/uploads/" + fname
    conn = get_db()
    try:
        conn.execute(text(
            "INSERT INTO documents (project_id,uploaded_by,filename,url,category,created_at) VALUES (:pid,:uid,:fn,:url,:cat,datetime('now'))"
        ), {"pid": pid, "uid": user["sub"], "fn": file.filename or "document", "url": url, "cat": category})
        conn.commit()
        return {"ok": True, "url": url, "filename": file.filename, "category": category}
    finally:
        conn.close()


@router.get("/api/projects/{pid}/documents")
def get_project_documents(pid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            text("SELECT id,project_id,uploaded_by,filename,url,category,created_at FROM documents WHERE project_id=:pid ORDER BY created_at DESC"),
            {"pid": pid}
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


@router.delete("/api/documents/{did}")
def delete_document(did: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(text("SELECT uploaded_by FROM documents WHERE id=:did"), {"did": did}).fetchone()
        if not row:
            raise HTTPException(404, "Document non trouvé")
        if row[0] != user["sub"] and user.get("role") != "admin":
            raise HTTPException(403, "Non autorisé")
        conn.execute(text("DELETE FROM documents WHERE id=:did"), {"did": did})
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
