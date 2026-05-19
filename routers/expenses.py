"""
routers/expenses.py — CRUD dépenses.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from core import get_db, sql_params, uid, now_iso, get_current_user, log_activity

router = APIRouter(tags=["expenses"])


class ExpenseIn(BaseModel):
    description: str
    montant: float
    categorie: Optional[str] = "Autre"
    date: Optional[str] = ""
    project_id: Optional[str] = None


@router.get("/api/expenses")
def get_expenses(user: dict = Depends(get_current_user), limit: int = 50, offset: int = 0):
    conn = get_db()
    try:
        total = conn.execute(*sql_params("SELECT COUNT(*) FROM expenses WHERE user_id=? AND deleted=0", [user["sub"]])).fetchone()[0]
        rows = conn.execute(
            *sql_params("SELECT * FROM expenses WHERE user_id=? AND deleted=0 ORDER BY date DESC, id DESC LIMIT ? OFFSET ?", [user["sub"], limit, offset])
        ).fetchall()
        resp = JSONResponse(content=[dict(r._mapping) for r in rows])
        resp.headers["X-Total-Count"] = str(total)
        return resp
    finally:
        conn.close()


@router.post("/api/expenses", status_code=201)
def create_expense(data: ExpenseIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        eid = "e" + uid()
        date = data.date or datetime.utcnow().strftime("%Y-%m-%d")
        conn.execute(*sql_params(
            "INSERT INTO expenses (id,user_id,project_id,description,montant,categorie,date) VALUES (?,?,?,?,?,?,?)",
            [eid, user["sub"], data.project_id, data.description, data.montant, data.categorie, date]
        ))
        log_activity(conn, user["sub"], f"Dépense ajoutée : {data.description} ({int(round(data.montant)):,} DH)")
        conn.commit()
        return dict(conn.execute(*sql_params("SELECT * FROM expenses WHERE id=?", [eid])).fetchone()._mapping)
    finally:
        conn.close()


@router.delete("/api/expenses/{eid}")
def delete_expense(eid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT description, montant FROM expenses WHERE id=? AND user_id=?", [eid, user["sub"]])).fetchone()
        if not row:
            raise HTTPException(404, "Dépense non trouvée")
        conn.execute(*sql_params("UPDATE expenses SET deleted=1 WHERE id=?", [eid]))
        log_activity(conn, user["sub"], f"Dépense supprimée : {row[0]} ({int(row[1] or 0):,} DH)")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
