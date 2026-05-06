def test_products_seed(client):
    response = client.get("/products")
    assert response.status_code == 200
    products = response.json()
    assert len(products) > 0
    sample = products[0]
    for field in ("id", "brand", "name", "category", "skin_types", "concerns"):
        assert field in sample


def test_products_filter_by_category(client):
    response = client.get("/products", params={"category": "sunscreen"})
    assert response.status_code == 200
    products = response.json()
    assert all(p["category"] == "sunscreen" for p in products)


def test_create_product(client):
    payload = {
        "brand": "Test",
        "name": "Test Product",
        "category": "moisturizer",
        "skin_types": ["dry"],
        "concerns": ["hydration"],
        "ingredients": ["glycerin"],
        "price": 5.0,
    }
    response = client.post("/products", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["brand"] == "Test"
    assert body["id"] > 0
