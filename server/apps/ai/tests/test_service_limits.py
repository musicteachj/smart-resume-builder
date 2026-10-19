"""Cost and latency bounds on the Claude client and prompts (no network)."""

import pytest
from django.conf import settings

from apps.ai import service


@pytest.fixture(autouse=True)
def _fresh_client():
    service._client.cache_clear()
    yield
    service._client.cache_clear()


def test_client_times_out_before_the_load_balancer(settings):
    # Sonnet calls: one attempt, cut well before the ALB's 120s idle timeout, so a
    # slow call fails cleanly (uncharged) instead of the ALB 504ing a call that
    # still bills the user's quota.
    settings.ANTHROPIC_API_KEY = "test-key"
    client = service._client()
    assert client.timeout == settings.AI_TIMEOUT_SECONDS == 100
    assert client.max_retries == 0


def test_simple_client_is_short_with_retries(settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    simple = service._simple_client()
    assert simple.timeout == settings.AI_SIMPLE_TIMEOUT_SECONDS == 30
    assert simple.max_retries == 2
    # Worst case (3 attempts) still fits under gunicorn's 120s.
    assert simple.timeout * (simple.max_retries + 1) < 120


def test_prompt_text_is_capped():
    bullets = ["x" * 500] * 12
    content = {
        "personalInfo": {"name": "A"},
        "workExperience": [{"id": f"w{i}", "position": "P", "bullets": bullets} for i in range(20)],
        "education": [],
        "skills": [],
    }
    text = service._content_to_text(content)
    assert len(text) == settings.AI_MAX_PROMPT_CHARS
