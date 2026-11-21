import io
import json
import urllib.parse
from unittest.mock import Mock

import pytest

from apps.demo.turnstile import DUMMY_TOKEN, SITEVERIFY_URL, TIMEOUT_SECONDS, Verdict, verify

PASS, FAIL = "1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA"
SPENT = "3x0000000000000000000000000000000AA"
HOST = "resumeiq.jameslittlefield.net"


class _Reply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def siteverify(monkeypatch):
    """Fake urlopen with a JSON body; the mock records the request."""

    def install(body):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        urlopen = Mock(return_value=_Reply(raw))
        monkeypatch.setattr("urllib.request.urlopen", urlopen)
        return urlopen

    return install


def test_test_secrets_answer_without_a_network_call(settings, monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=AssertionError("no network")))
    settings.TURNSTILE_SECRET_KEY = PASS
    assert verify(DUMMY_TOKEN, None) is Verdict.PASSED
    assert verify("other", None) is Verdict.FAILED
    settings.TURNSTILE_SECRET_KEY = FAIL
    assert verify(DUMMY_TOKEN, None) is Verdict.FAILED
    settings.TURNSTILE_SECRET_KEY = SPENT
    assert verify(DUMMY_TOKEN, None) is Verdict.FAILED


@pytest.mark.parametrize(
    "body, expected",
    [
        ({"success": True, "hostname": HOST, "action": "start-demo"}, Verdict.PASSED),
        ({"success": True, "hostname": "evil.example", "action": "start-demo"}, Verdict.FAILED),
        ({"success": True, "hostname": HOST, "action": "other"}, Verdict.FAILED),
        ({"success": True, "hostname": HOST}, Verdict.FAILED),
        ({"success": False, "error-codes": ["invalid-input-response"]}, Verdict.FAILED),
        ({"success": False, "error-codes": ["timeout-or-duplicate"]}, Verdict.FAILED),
        ({"success": False, "error-codes": ["internal-error"]}, Verdict.UNAVAILABLE),
        ({"success": False, "error-codes": ["invalid-input-secret"]}, Verdict.UNAVAILABLE),
        ({"success": False, "error-codes": ["missing-input-secret"]}, Verdict.UNAVAILABLE),
        ({"success": False, "error-codes": ["bad-request"]}, Verdict.UNAVAILABLE),
        (["not", "an", "object"], Verdict.UNAVAILABLE),
        (b"<html>not json</html>", Verdict.UNAVAILABLE),
    ],
)
def test_siteverify_answers(settings, siteverify, body, expected):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = [HOST]
    siteverify(body)
    assert verify("token", "203.0.113.7") is expected


def test_siteverify_sends_the_form_with_a_timeout(settings, siteverify):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = [HOST]
    urlopen = siteverify({"success": True, "hostname": HOST, "action": "start-demo"})
    assert verify("the-token", "203.0.113.7") is Verdict.PASSED
    request = urlopen.call_args.args[0]
    assert request.full_url == SITEVERIFY_URL
    assert request.get_method() == "POST"
    assert urlopen.call_args.kwargs["timeout"] == TIMEOUT_SECONDS == 5
    form = urllib.parse.parse_qs(request.data.decode())
    assert form["secret"] == ["0x-real-secret"]
    assert form["response"] == ["the-token"]
    assert form["remoteip"] == ["203.0.113.7"]
    assert len(form["idempotency_key"][0]) >= 32


def test_siteverify_leaves_out_remoteip_when_unknown(settings, siteverify):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = [HOST]
    urlopen = siteverify({"success": False})
    verify("token", None)
    assert "remoteip" not in urllib.parse.parse_qs(urlopen.call_args.args[0].data.decode())


@pytest.mark.parametrize("hosts", [["*"], [".jameslittlefield.net"], ["*", ".example.com"], []])
def test_siteverify_without_a_concrete_hostname_fails_closed(settings, siteverify, hosts):
    # A success we cannot tie to our own host proves nothing.
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = hosts
    siteverify({"success": True, "hostname": HOST, "action": "start-demo"})
    assert verify("token", None) is Verdict.FAILED


def test_any_concrete_allowed_host_is_accepted(settings, siteverify):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = ["*", ".example.com", "other.example", HOST]
    siteverify({"success": True, "hostname": HOST, "action": "start-demo"})
    assert verify("token", None) is Verdict.PASSED


def test_siteverify_timeout_is_unavailable(settings, monkeypatch):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=TimeoutError()))
    assert verify("token", None) is Verdict.UNAVAILABLE


def test_siteverify_http_error_is_unavailable(settings, monkeypatch):
    import urllib.error

    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    error = urllib.error.HTTPError(SITEVERIFY_URL, 500, "boom", {}, None)
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=error))
    assert verify("token", None) is Verdict.UNAVAILABLE


def test_a_missing_secret_is_unavailable_without_a_request(settings, monkeypatch):
    settings.TURNSTILE_SECRET_KEY = ""
    urlopen = Mock()
    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    assert verify("token", None) is Verdict.UNAVAILABLE
    urlopen.assert_not_called()


def test_an_empty_token_fails_without_a_request(settings, monkeypatch):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    urlopen = Mock()
    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    assert verify("", None) is Verdict.FAILED
    urlopen.assert_not_called()


def test_nothing_secret_is_logged(settings, siteverify, caplog):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = [HOST]
    siteverify({"success": False, "error-codes": ["invalid-input-secret"]})
    with caplog.at_level("DEBUG"):
        verify("sensitive-token", "203.0.113.7")
    logged = caplog.text
    assert "0x-real-secret" not in logged
    assert "sensitive-token" not in logged
    assert "203.0.113.7" not in logged


def test_an_http_client_error_is_unavailable(settings, monkeypatch):
    import http.client

    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=http.client.IncompleteRead(b"par")))
    assert verify("token", None) is Verdict.UNAVAILABLE
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=http.client.BadStatusLine("junk")))
    assert verify("token", None) is Verdict.UNAVAILABLE


@pytest.mark.parametrize(
    "body, expected",
    [
        ({"success": False, "error-codes": [["nested"], {"a": 1}, "invalid-input-response"]}, Verdict.FAILED),
        ({"success": False, "error-codes": [["nested"], "internal-error"]}, Verdict.UNAVAILABLE),
        ({"success": True, "hostname": [HOST], "action": "start-demo"}, Verdict.FAILED),
        ({"success": True, "hostname": {"a": 1}, "action": "start-demo"}, Verdict.FAILED),
        ({"success": True, "hostname": HOST, "action": ["start-demo"]}, Verdict.FAILED),
        ({"success": True, "hostname": None, "action": "start-demo"}, Verdict.FAILED),
    ],
)
def test_malformed_reply_shapes_never_raise(settings, siteverify, body, expected):
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = [HOST]
    siteverify(body)
    assert verify("token", None) is expected


def test_the_settings_test_key_set_matches_turnstile(settings):
    from apps.demo.turnstile import TEST_SECRETS, TEST_SITE_KEYS
    from config.settings import TURNSTILE_TEST_KEYS

    assert TURNSTILE_TEST_KEYS == TEST_SITE_KEYS | TEST_SECRETS
