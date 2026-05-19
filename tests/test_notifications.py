"""Tests for notification endpoints."""
import pytest


def test_list_notifications_empty(client, auth_headers):
    """/api/notifications should return a list (empty initially)."""
    r = client.get("/api/notifications", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_notifications_no_auth(client):
    """Notifications without auth should return 401."""
    r = client.get("/api/notifications")
    assert r.status_code == 401


def test_mark_all_notifications_read(client, auth_headers):
    """Mark all notifications as read."""
    r = client.post("/api/notifications/read-all", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True
