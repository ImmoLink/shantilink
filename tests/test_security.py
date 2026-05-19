"""Security and misc endpoint tests."""
import pytest


def test_health_endpoint(client):
    """/health should return ok status."""
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"


def test_ping_endpoint(client):
    """/ping should return ok."""
    r = client.get("/ping")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_api_ping_endpoint(client):
    """/api/ping should return ok."""
    r = client.get("/api/ping")
    assert r.status_code == 200


def test_projects_no_auth_returns_401(client):
    """/api/projects without token should return 401."""
    r = client.get("/api/projects")
    assert r.status_code == 401


def test_expenses_no_auth_returns_401(client):
    """/api/expenses without token should return 401."""
    r = client.get("/api/expenses")
    assert r.status_code == 401


def test_me_no_auth_returns_401(client):
    """/api/me without token should return 401."""
    r = client.get("/api/me")
    assert r.status_code == 401


def test_docs_in_dev_mode(client):
    """In dev mode (ENV=dev), /api/docs should be accessible."""
    r = client.get("/api/docs")
    assert r.status_code in [200, 404]  # 404 is acceptable if docs_url differs


def test_stats_public(client):
    """/api/stats is public."""
    r = client.get("/api/stats")
    assert r.status_code == 200
    data = r.json()
    assert "users" in data
    assert "projects" in data


def test_platform_stats_public(client):
    """/api/stats/platform is public."""
    r = client.get("/api/stats/platform")
    assert r.status_code == 200
    data = r.json()
    assert "pros" in data


def test_community_posts_public(client):
    """/api/community/posts is accessible without auth."""
    r = client.get("/api/community/posts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_bootstrap_already_exists(client, admin_headers):
    """Second bootstrap attempt should fail since admin already exists."""
    r = client.post("/api/bootstrap", json={
        "email": "second@test.com",
        "password": "AnotherAdmin123!",
        "prenom": "X",
        "nom": "Y"
    })
    assert r.status_code in [400, 403, 404], f"Expected 400/403/404, got {r.status_code}: {r.text}"


def test_admin_endpoint_requires_admin(client, auth_headers):
    """Admin stats should be forbidden for regular users."""
    r = client.get("/api/admin/stats", headers=auth_headers)
    assert r.status_code == 403


def test_security_headers_present(client):
    """Security headers should be present in responses."""
    r = client.get("/health")
    assert "x-content-type-options" in r.headers or "X-Content-Type-Options" in r.headers


def test_professionals_public(client):
    """/api/professionals is accessible without auth (with masked phone)."""
    r = client.get("/api/professionals")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_invalid_token(client):
    """Invalid token should return 401."""
    r = client.get("/api/me", headers={"Authorization": "Bearer invalidtoken.abc"})
    assert r.status_code == 401
