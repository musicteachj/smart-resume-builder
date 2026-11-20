import pytest
from rest_framework.test import APIClient

CLOSED = [
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/password-reset",
    "/api/auth/password-reset/confirm",
]


@pytest.mark.django_db
@pytest.mark.parametrize("path", CLOSED)
def test_account_routes_are_404_in_demo_mode(settings, path):
    settings.DEMO_MODE = True
    assert APIClient().post(path, {}, format="json").status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("path", CLOSED)
def test_account_routes_still_answer_outside_demo_mode(path):
    assert APIClient().post(path, {}, format="json").status_code in (400, 401)


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/api/schema/", "/api/schema/swagger-ui/"])
def test_api_docs_are_404_in_demo_mode_even_for_a_guest(settings, guest, path):
    settings.DEMO_MODE = True
    client = APIClient()
    client.force_authenticate(guest)
    assert client.get(path).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    "method, path, expected",
    [("post", "/api/auth/refresh", 401), ("post", "/api/auth/logout", 204), ("get", "/api/auth/me", 401)],
)
def test_session_routes_stay_open_in_demo_mode(settings, method, path, expected):
    settings.DEMO_MODE = True
    assert getattr(APIClient(), method)(path).status_code == expected


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/api/schema/", "/api/schema/swagger-ui/"])
@pytest.mark.parametrize(
    "authorization",
    ["Bearer not-a-jwt", "Bearer ", "Bearer a b", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.c2lnbmF0dXJl", "Basic Zm9vOmJhcg=="],
)
def test_api_docs_are_404_in_demo_mode_with_a_malformed_bearer(settings, path, authorization):
    # A bad Authorization header must not turn the hidden docs into a 500 (or a 401 that reveals them).
    settings.DEMO_MODE = True
    client = APIClient(raise_request_exception=False)
    assert client.get(path, HTTP_AUTHORIZATION=authorization).status_code == 404
