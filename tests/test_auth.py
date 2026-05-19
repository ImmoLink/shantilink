"""Tests for authentication endpoints."""
import pytest


def test_register_new_user(client):
    """Register a fresh user — should return 200/201 with token."""
    r = client.post("/api/register", json={
        "email": "newuser_auth@test.com",
        "password": "NewPass123!",
        "prenom": "New",
        "nom": "User",
        "role": "client"
    })
    assert r.status_code in [200, 201], f"Expected 200/201, got {r.status_code}: {r.text}"
    data = r.json()
    assert "token" in data, f"No token in response: {data}"
    assert data["user"]["email"] == "newuser_auth@test.com"


def test_register_duplicate_email(client):
    """Duplicate email should return 409."""
    payload = {
        "email": "dup@test.com",
        "password": "DupPass123!",
        "prenom": "Dup",
        "nom": "User",
        "role": "client"
    }
    client.post("/api/register", json=payload)
    r = client.post("/api/register", json=payload)
    assert r.status_code == 409


def test_register_weak_password(client):
    """Weak password should be rejected."""
    r = client.post("/api/register", json={
        "email": "weak@test.com",
        "password": "short",
        "prenom": "Weak",
        "nom": "User",
        "role": "client"
    })
    assert r.status_code == 400


def test_login_valid(client, auth_headers):
    """Login with valid credentials should return token."""
    r = client.post("/api/login", json={
        "email": "test@test.com",
        "password": "TestPass123!"
    })
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password(client):
    """Wrong password should return 401."""
    r = client.post("/api/login", json={
        "email": "test@test.com",
        "password": "wrongpassword"
    })
    assert r.status_code == 401


def test_login_unknown_email(client):
    """Unknown email should return 401."""
    r = client.post("/api/login", json={
        "email": "nobody@nowhere.com",
        "password": "SomePass123!"
    })
    assert r.status_code == 401


def test_get_me(client, auth_headers):
    """/api/me should return authenticated user profile."""
    r = client.get("/api/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "test@test.com"
    assert "role" in data


def test_get_me_no_auth(client):
    """/api/me without token should return 401."""
    r = client.get("/api/me")
    assert r.status_code == 401


def test_logout(client, auth_headers):
    """Logout should return ok."""
    r = client.post("/api/logout", headers=auth_headers)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_get_profile(client, auth_headers):
    """/api/profile should return plan, usage, referral info."""
    r = client.get("/api/profile", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "plan" in data
    assert "usage" in data


def test_update_profile(client, auth_headers):
    """PUT /api/profile should update user fields."""
    r = client.put("/api/profile", json={
        "ville": "Marrakech",
        "tel": "+212600000000"
    }, headers=auth_headers)
    assert r.status_code == 200


def test_plan_status(client, auth_headers):
    """/api/plan/status should return plan info."""
    r = client.get("/api/plan/status", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "plan" in data
    assert "limits" in data
