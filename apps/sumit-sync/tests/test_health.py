"""
Smoke test for the FastAPI health endpoint.
Verifies the app boots and /health responds.
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
