"""Tests for project endpoints."""
import pytest


def test_list_projects_empty_auth(client, auth_headers):
    """/api/projects should return a list (possibly empty)."""
    r = client.get("/api/projects", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_project(client, auth_headers):
    """Create a project, should return project dict with id."""
    r = client.post("/api/projects", json={
        "nom": "Villa Test",
        "description": "Test description",
        "ville": "Casablanca",
        "budget": 500000,
        "type": "Villa / Maison individuelle"
    }, headers=auth_headers)
    assert r.status_code in [200, 201], f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "id" in data
    assert data["nom"] == "Villa Test"


def test_create_project_no_auth(client):
    """Creating project without auth should return 401."""
    r = client.post("/api/projects", json={
        "nom": "Unauth Project",
        "ville": "Rabat",
        "budget": 0
    })
    assert r.status_code == 401


def test_update_project(client, auth_headers, test_project_id):
    """Update an existing project."""
    r = client.put(f"/api/projects/{test_project_id}", json={
        "nom": "Updated Name",
        "ville": "Rabat",
        "budget": 200000,
        "type": "Villa / Maison individuelle",
        "description": "Updated"
    }, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["nom"] == "Updated Name"


def test_update_project_pct(client, auth_headers, test_project_id):
    """Update project completion percentage."""
    r = client.patch(f"/api/projects/{test_project_id}/pct", json={"pct": 50}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["pct"] == 50


def test_update_project_phases(client, auth_headers, test_project_id):
    """Update project phases."""
    import json
    phases = json.dumps([{"id": "ph1", "name": "Fondations", "start": "2026-01-01", "end": "2026-02-01", "done": False}])
    r = client.patch(f"/api/projects/{test_project_id}/phases", json={"phases": phases}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_delete_project(client, auth_headers):
    """Create then delete a project."""
    r = client.post("/api/projects", json={
        "nom": "To Delete",
        "description": "Will be deleted",
        "ville": "Fes",
        "budget": 0,
        "type": "Villa / Maison individuelle"
    }, headers=auth_headers)
    assert r.status_code in [200, 201]
    pid = r.json()["id"]

    r2 = client.delete(f"/api/projects/{pid}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["ok"] is True


def test_delete_nonexistent_project(client, auth_headers):
    """Deleting a non-existent project should return 404."""
    r = client.delete("/api/projects/nonexistent-id", headers=auth_headers)
    assert r.status_code == 404


def test_share_project(client, auth_headers, test_project_id):
    """Generate a share link for a project."""
    r = client.post(f"/api/projects/{test_project_id}/share", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "share_token" in data
    assert "share_url" in data


def test_shared_project_public_access(client, auth_headers, test_project_id):
    """Access shared project without auth using share token."""
    # Get share token
    r = client.post(f"/api/projects/{test_project_id}/share", headers=auth_headers)
    assert r.status_code == 200
    share_token = r.json()["share_token"]

    # Access without auth
    r2 = client.get(f"/api/shared/{share_token}")
    assert r2.status_code == 200
    data = r2.json()
    assert "project" in data


def test_list_briefs(client, auth_headers):
    """/api/briefs should return a list."""
    r = client.get("/api/briefs", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_and_list_briefs(client, auth_headers):
    """Create a brief and verify it appears in listing."""
    r = client.post("/api/briefs", json={
        "titre": "Recherche entrepreneur maçonnerie",
        "description": "Pour villa R+1",
        "ville": "Casablanca",
        "categorie": "entrepreneur",
        "budget_min": 100000,
        "budget_max": 200000,
        "brief_type": "demand"
    }, headers=auth_headers)
    assert r.status_code in [200, 201]
    data = r.json()
    assert "id" in data
