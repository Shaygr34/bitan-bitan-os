"""
Smoke test for the FastAPI health endpoint.
Verifies the app boots and /health responds.

Full engine tests arrive in PR2 with golden run fixtures.
"""

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health_returns_200():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "status" in body
    assert "db" in body
    assert "volume" in body
