import pytest
from fastapi.testclient import TestClient
import sys
import os

# Insert project root into sys.path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Force in-memory SQLite for tests — must be set BEFORE importing main
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-2025"
os.environ.setdefault("SHANTILINK_SECRET", "test-secret-key-for-pytest-2025")
os.environ["ENV"] = "dev"

from main import app, init_db

init_db()


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    """Register + login a regular test user, return auth headers."""
    r = client.post("/api/register", json={
        "email": "test@test.com",
        "password": "TestPass123!",
        "prenom": "Test",
        "nom": "User",
        "role": "client",
        "ville": "Casablanca"
    })
    # If already exists, login instead
    if r.status_code == 409:
        r = client.post("/api/login", json={
            "email": "test@test.com",
            "password": "TestPass123!"
        })
    token = r.json().get("token", "")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    """Bootstrap admin user, return auth headers."""
    r = client.post("/api/bootstrap", json={
        "email": "admin@test.com",
        "password": "AdminPass123!",
        "prenom": "Admin",
        "nom": "Test"
    })
    if r.status_code == 400:
        # Admin already exists, try login
        r = client.post("/api/login", json={
            "email": "admin@test.com",
            "password": "AdminPass123!"
        })
    token = r.json().get("token", "")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def test_project_id(client, auth_headers):
    """Create a test project and return its ID."""
    r = client.post("/api/projects", json={
        "nom": "Projet Test Fixture",
        "description": "Projet pour les tests",
        "ville": "Casablanca",
        "budget": 100000,
        "type": "Villa / Maison individuelle"
    }, headers=auth_headers)
    assert r.status_code in [200, 201], f"Failed to create project: {r.text}"
    return r.json()["id"]
