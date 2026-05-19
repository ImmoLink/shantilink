"""
routers/community.py — Posts communauté, ratings, directory, media upload.
"""
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List

from core import (
    get_db, sql_params, uid, now_iso,
    get_current_user,
    UPLOADS_DIR, _CLOUDINARY_OK
)

router = APIRouter(tags=["community"])


class PostIn(BaseModel):
    content: str
    category: Optional[str] = "update"
    titre: Optional[str] = ""
    tags: Optional[str] = "[]"
    media_url: Optional[str] = ""
    media_urls: Optional[List[str]] = []


class CommunityProfileIn(BaseModel):
    bio: Optional[str] = None
    photo_url: Optional[str] = None


class RatingIn(BaseModel):
    rated_pro_id: int
    rating: int
    comment: Optional[str] = ""


@router.get("/api/community/directory")
def community_directory(q: str = "", role: str = "", ville: str = "", limit: int = 50):
    conn = get_db()
    try:
        pro_roles = ('architecte','promoteur','bureau','notaire','electricien','plombier','comptable','autre','client')
        placeholders = ','.join('?' * len(pro_roles))
        query = f"SELECT id,prenom,nom,role,ville,tel,created_at FROM users WHERE role IN ({placeholders})"
        params: list = list(pro_roles)
        if role:
            query = "SELECT id,prenom,nom,role,ville,tel,created_at FROM users WHERE role=?"
            params = [role]
        if ville:
            query += " AND ville LIKE ?"; params.append(f"%{ville}%")
        if q:
            query += " AND (prenom LIKE ? OR nom LIKE ?)"; params += [f"%{q}%", f"%{q}%"]
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        users = conn.execute(*sql_params(query, params)).fetchall()
        results = [dict(r._mapping) for r in users]
        if not results:
            pq = "SELECT id,nom,role,ville,description,verified,note FROM professionals WHERE 1=1"
            pp: list = []
            if role:
                pq += " AND role=?"; pp.append(role)
            if ville:
                pq += " AND ville LIKE ?"; pp.append(f"%{ville}%")
            if q:
                pq += " AND (nom LIKE ? OR description LIKE ?)"; pp += [f"%{q}%", f"%{q}%"]
            pq += " ORDER BY note DESC LIMIT ?"; pp.append(limit)
            rows = conn.execute(*sql_params(pq, pp)).fetchall()
            results = [dict(r._mapping) for r in rows]
        return results
    finally:
        conn.close()


@router.get("/api/community")
@router.get("/api/community/posts")
def get_community_posts(request: Request, limit: int = 20, offset: int = 0):
    conn = get_db()
    try:
        total = conn.execute(*sql_params("SELECT COUNT(*) FROM community_posts", [])).scalar()
        rows = conn.execute(*sql_params("""
            SELECT cp.id, cp.content, cp.titre, cp.category, cp.tags, cp.est_epingle,
                   cp.media_url, cp.media_urls, cp.likes, cp.created_at,
                   u.id as user_id, u.prenom, u.nom, u.role, u.ville
            FROM community_posts cp
            JOIN users u ON u.id = cp.user_id
            ORDER BY cp.est_epingle DESC, cp.created_at DESC
            LIMIT ? OFFSET ?
        """, [limit, offset])).fetchall()
        result = []
        for r in rows:
            d = dict(r._mapping)
            try:
                d["media_urls"] = json.loads(d.get("media_urls") or "[]")
            except Exception:
                d["media_urls"] = []
            if d.get("media_url") and not d["media_urls"]:
                d["media_urls"] = [d["media_url"]]
            result.append(d)
        response = JSONResponse(result)
        response.headers["X-Total-Count"] = str(total)
        return response
    finally:
        conn.close()


@router.post("/api/community", status_code=201)
@router.post("/api/community/posts", status_code=201)
def create_community_post(data: PostIn, user: dict = Depends(get_current_user)):
    if not data.content or not data.content.strip():
        raise HTTPException(400, "Le contenu ne peut pas être vide")
    conn = get_db()
    try:
        post_id = "cp" + uid()
        media_urls_json = json.dumps(data.media_urls or [])
        conn.execute(*sql_params(
            "INSERT INTO community_posts (id,user_id,content,category,titre,tags,media_url,media_urls,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [post_id, user["sub"], data.content.strip()[:2000], data.category, (data.titre or '')[:200], (data.tags or '[]'), (data.media_url or ''), media_urls_json, now_iso()]
        ))
        conn.commit()
        return {"id": post_id, "ok": True}
    finally:
        conn.close()


@router.post("/api/community/{post_id}/like")
def like_community_post(post_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        r = conn.execute(*sql_params("UPDATE community_posts SET likes=likes+1 WHERE id=?", [post_id]))
        conn.commit()
        if r.rowcount == 0:
            raise HTTPException(404, "Post non trouvé")
        row = conn.execute(*sql_params("SELECT likes FROM community_posts WHERE id=?", [post_id])).fetchone()
        return {"ok": True, "likes": row[0] if row else 0}
    finally:
        conn.close()


@router.get("/api/community/profile/{user_id}")
def get_community_profile(user_id: str):
    conn = get_db()
    try:
        row = conn.execute(
            *sql_params("SELECT id,prenom,nom,role,ville,bio,photo_url,created_at FROM users WHERE id=?", [user_id])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Profil non trouvé")
        posts = conn.execute(
            *sql_params("SELECT id,content,category,created_at FROM community_posts WHERE user_id=? ORDER BY created_at DESC LIMIT 5", [user_id])
        ).fetchall()
        result = dict(row._mapping)
        result["posts"] = [dict(p._mapping) for p in posts]
        return result
    finally:
        conn.close()


@router.put("/api/community/profile")
def update_community_profile(data: CommunityProfileIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        updates, params = [], []
        if data.bio is not None:
            updates.append("bio=?"); params.append(data.bio[:500])
        if data.photo_url is not None:
            updates.append("photo_url=?"); params.append(data.photo_url)
        if updates:
            params.append(user["sub"])
            conn.execute(*sql_params(f"UPDATE users SET {','.join(updates)} WHERE id=?", params))
            conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/api/community/ratings", status_code=201)
def rate_professional(data: RatingIn, user: dict = Depends(get_current_user)):
    if not 1 <= data.rating <= 5:
        raise HTTPException(400, "La note doit être entre 1 et 5")
    conn = get_db()
    try:
        existing = conn.execute(
            *sql_params("SELECT id FROM community_ratings WHERE rater_id=? AND rated_pro_id=?", [user["sub"], data.rated_pro_id])
        ).fetchone()
        if existing:
            conn.execute(*sql_params(
                "UPDATE community_ratings SET rating=?,comment=? WHERE id=?",
                [data.rating, data.comment, existing[0]]
            ))
        else:
            conn.execute(*sql_params(
                "INSERT INTO community_ratings (id,rater_id,rated_pro_id,rating,comment,created_at) VALUES (?,?,?,?,?,?)",
                ["r" + uid(), user["sub"], data.rated_pro_id, data.rating, data.comment, now_iso()]
            ))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── Media upload ──────────────────────────────────────────────────────────────
@router.post("/api/posts/upload-media")
async def upload_post_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ALLOWED_IMAGES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    ALLOWED_VIDEOS = {"video/mp4", "video/webm", "video/quicktime"}
    ALLOWED = ALLOWED_IMAGES | ALLOWED_VIDEOS

    ct = file.content_type or ""
    if ct not in ALLOWED:
        raise HTTPException(400, "Format non supporté. Acceptés : JPG, PNG, GIF, WEBP, MP4, WEBM")

    is_video = ct.startswith("video/")
    MAX_SIZE = 50 * 1024 * 1024 if is_video else 10 * 1024 * 1024
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        limit_label = "50MB" if is_video else "10MB"
        raise HTTPException(400, f"Fichier trop volumineux. Limite : {limit_label}")

    media_type = "video" if is_video else "image"

    if _CLOUDINARY_OK:
        try:
            import cloudinary.uploader
            result = cloudinary.uploader.upload(
                contents,
                folder=f"shantilink/posts/{user['sub']}",
                resource_type=media_type,
                transformation=[
                    {"width": 1200, "height": 900, "crop": "limit", "quality": "auto:good"}
                ] if media_type == "image" else [],
            )
            thumbnail = result["secure_url"]
            return {
                "url": result["secure_url"],
                "type": media_type,
                "thumbnail": thumbnail,
                "public_id": result["public_id"],
                "width": result.get("width"),
                "height": result.get("height"),
            }
        except Exception as e:
            raise HTTPException(500, f"Erreur Cloudinary : {str(e)}")

    ext = os.path.splitext(file.filename or "file")[-1].lower() or (".mp4" if is_video else ".jpg")
    fname = "cm_" + uid() + ext
    dest = os.path.join(UPLOADS_DIR, fname)
    with open(dest, "wb") as f:
        f.write(contents)
    url = "/static/uploads/" + fname
    return {"url": url, "type": media_type, "thumbnail": url, "public_id": fname, "width": None, "height": None}


@router.delete("/api/posts/media/{public_id:path}")
async def delete_post_media(public_id: str, user: dict = Depends(get_current_user)):
    if _CLOUDINARY_OK:
        if f"posts/{user['sub']}" not in public_id and "admin" not in public_id:
            raise HTTPException(403, "Non autorisé")
        try:
            import cloudinary.uploader
            cloudinary.uploader.destroy(public_id, resource_type="image")
        except Exception:
            pass
    else:
        fname = os.path.basename(public_id)
        if user["sub"] not in fname and user.get("role") != "admin":
            raise HTTPException(403, "Non autorisé")
        path = os.path.join(UPLOADS_DIR, fname)
        path = os.path.realpath(path)
        if not path.startswith(os.path.realpath(UPLOADS_DIR)):
            raise HTTPException(400, "Chemin invalide")
        if os.path.exists(path):
            os.remove(path)
    return {"ok": True}
