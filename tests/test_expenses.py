"""Tests for expense endpoints."""
import pytest


def test_list_expenses_empty(client, auth_headers):
    """/api/expenses should return a list."""
    r = client.get("/api/expenses", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_expense(client, auth_headers, test_project_id):
    """Create an expense linked to a project."""
    r = client.post("/api/expenses", json={
        "description": "Achat ciment 50 sacs",
        "montant": 3500,
        "categorie": "Matériaux",
        "date": "2026-05-19",
        "project_id": test_project_id
    }, headers=auth_headers)
    assert r.status_code in [200, 201], f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "id" in data
    assert data["montant"] == 3500.0


def test_create_expense_no_project(client, auth_headers):
    """Create an expense without project link."""
    r = client.post("/api/expenses", json={
        "description": "Transport matériaux",
        "montant": 800,
        "categorie": "Transport",
        "date": "2026-05-19"
    }, headers=auth_headers)
    assert r.status_code in [200, 201]
    assert "id" in r.json()


def test_delete_expense(client, auth_headers, test_project_id):
    """Create then soft-delete an expense."""
    r = client.post("/api/expenses", json={
        "description": "Dépense à supprimer",
        "montant": 1000,
        "categorie": "Autre",
        "date": "2026-05-19",
        "project_id": test_project_id
    }, headers=auth_headers)
    assert r.status_code in [200, 201]
    eid = r.json()["id"]

    r2 = client.delete(f"/api/expenses/{eid}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["ok"] is True


def test_delete_nonexistent_expense(client, auth_headers):
    """Deleting non-existent expense should return 404."""
    r = client.delete("/api/expenses/nonexistent-expense-id", headers=auth_headers)
    assert r.status_code == 404


def test_expenses_no_auth(client):
    """Expenses endpoint requires auth."""
    r = client.get("/api/expenses")
    assert r.status_code == 401
