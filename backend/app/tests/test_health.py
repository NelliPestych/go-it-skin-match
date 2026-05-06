def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert payload["database"] == "up"
    # redis is intentionally unreachable in the test fixture
    assert payload["redis"] == "down"


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == "SkinMatch"
