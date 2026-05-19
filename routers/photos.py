"""
routers/photos.py — Upload/delete photos de chantier.
"""
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import Optional

from core import (
    get_db, sql_params, uid, now_iso,
    get_current_user, log_activity,
    encrypt_gps, decrypt_gps,
    UPLOADS_DIR
)

router = APIRouter(tags=["photos"])


@router.get("/api/photos")
def get_photos(request: Request, limit: int = 50, offset: int = 0, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        total = conn.execute(
            *sql_params("SELECT COUNT(*) FROM photos WHERE user_id=?", [user["sub"]])
        ).scalar()
        rows = conn.execute(
            *sql_params("SELECT * FROM photos WHERE user_id=? ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
                        [user["sub"], limit, offset])
        ).fetchall()
        photos = []
        for r in rows:
            d = dict(r._mapping)
            d["gps"] = decrypt_gps(d.get("gps") or "")
            photos.append(d)
        response = JSONResponse(photos)
        response.headers["X-Total-Count"] = str(total)
        return response
    finally:
        conn.close()


@router.post("/api/photos", status_code=201)
async def create_photo(
    request: Request,
    description: str = Form(...),
    date: str = Form(""),
    phase: str = Form("Fondations"),
    emoji: str = Form("🏗️"),
    gps: str = Form(""),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    conn = get_db()
    try:
        phid = "ph" + uid()
        date_val = date or datetime.utcnow().strftime("%Y-%m-%d")
        image_url = ""
        if image and image.filename:
            ext = os.path.splitext(image.filename)[-1].lower() or ".jpg"
            allowed_ext = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}
            allowed_ct = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"}
            if ext not in allowed_ext:
                raise HTTPException(400, "Format non supporté. Utilisez JPG, PNG ou WEBP.")
            ct = (image.content_type or "").lower()
            if ct and ct not in allowed_ct:
                raise HTTPException(400, "Type de fichier invalide.")
            contents = await image.read()
            if len(contents) > 10 * 1024 * 1024:
                raise HTTPException(413, "Image trop volumineuse (max 10 MB)")
            try:
                from PIL import Image as _PIL
                import io as _io
                img = _PIL.open(_io.BytesIO(contents))
                img.verify()
            except Exception:
                raise HTTPException(400, "Fichier image corrompu ou invalide.")
            filename = phid + ext
            dest = os.path.join(UPLOADS_DIR, filename)
            with open(dest, "wb") as f:
                f.write(contents)
            image_url = "/static/uploads/" + filename
        gps_stored = encrypt_gps(gps)
        conn.execute(*sql_params(
            "INSERT INTO photos (id,user_id,description,date,phase,emoji,gps,image_url) VALUES (?,?,?,?,?,?,?,?)",
            [phid, user["sub"], description, date_val, phase, emoji, gps_stored, image_url]
        ))
        log_activity(conn, user["sub"], f"Photo GPS archivée : {description}")
        conn.commit()
        return dict(conn.execute(*sql_params("SELECT * FROM photos WHERE id=?", [phid])).fetchone()._mapping)
    finally:
        conn.close()


@router.delete("/api/photos/{phid}")
def delete_photo(phid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        r = conn.execute(*sql_params("DELETE FROM photos WHERE id=? AND user_id=?", [phid, user["sub"]]))
        conn.commit()
        if r.rowcount == 0:
            raise HTTPException(404, "Photo non trouvée")
        return {"ok": True}
    finally:
        conn.close()
