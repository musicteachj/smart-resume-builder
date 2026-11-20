"""What each feature sends to Claude, and how responses are read (fake client, no network).

The autouse `mock_claude` fixture replaces the service functions for the view tests, so
the real ones are imported here before it runs and exercised against a fake client.
"""

import pytest

from apps.ai import service
from apps.ai.service import (
    AIRefusedError,
    AIServiceError,
    ats_health_check as real_ats_health_check,
    generate_cover_letter as real_generate_cover_letter,
    generate_summary as real_generate_summary,
    improve_bullet as real_improve_bullet,
    parse_resume as real_parse_resume,
    tailor_to_jd as real_tailor_to_jd,
)

from .conftest import make_content
from .fakes import THINKING, _response, _text

pytestmark = pytest.mark.django_db


def _only_call(client):
    calls = client.messages.calls + client.beta.messages.calls
    assert len(calls) == 1
    return calls[0]


def test_default_models_are_the_current_haiku_and_sonnet(settings):
    from django.conf import settings as live

    assert live.AI_MODEL_SIMPLE == "claude-haiku-5-5"
    assert live.AI_MODEL_TAILOR == "claude-sonnet-5-5"


def test_improve_bullet_reads_text_after_thinking_with_room_to_think(fake, settings):
    settings.AI_MODEL_SIMPLE = "claude-haiku-5-5"
    client = fake(_response(THINKING, _text("Shipped X, cutting load time 40%.")))

    assert real_improve_bullet("did X", "Engineer") == "Shipped X, cutting load time 40%."
    call = _only_call(client)
    assert call["model"] == "claude-haiku-5-5"
    assert call["output_config"]["effort"] == "low"
    # Thinking counts toward max_tokens on the new models; a 256 cap could end the reply early.
    assert call["max_tokens"] >= 1024
    for removed in ("temperature", "top_p", "top_k", "tool_choice"):
        assert removed not in call
    assert client.messages.calls, "Haiku has no server-side fallback, so it uses the plain endpoint"


def test_summary_uses_low_effort(fake):
    client = fake(_response(_text("A summary.")))
    assert real_generate_summary(make_content()) == "A summary."
    assert _only_call(client)["output_config"]["effort"] == "low"


def _schema_objects(schema):
    """Every object node in a JSON schema."""
    if isinstance(schema, dict):
        if schema.get("type") == "object":
            yield schema
        for value in schema.values():
            yield from _schema_objects(value)
    elif isinstance(schema, list):
        for value in schema:
            yield from _schema_objects(value)


@pytest.mark.parametrize("schema", [service.TAILOR_SCHEMA, service.ATS_SCHEMA, service.PARSE_SCHEMA])
def test_json_schemas_meet_structured_output_rules(schema):
    objects = list(_schema_objects(schema))
    assert objects
    for node in objects:
        assert node.get("additionalProperties") is False
        # Structured outputs allow at most 24 optional fields per schema (the import schema
        # once had 25 and the API returned a 400); requiring every field avoids the limit.
        assert set(node.get("required", [])) == set(node["properties"])


def test_tailor_uses_json_output_not_a_forced_tool(fake, settings):
    settings.AI_MODEL_TAILOR = "claude-sonnet-5-5"
    payload = (
        '{"match_score": 140, "missing_keywords": ["SQL", "dbt"], "suggestions": '
        '[{"bullet_id": "w1::0", "current": "a", "suggested": "b", "adds": ["SQL"]}]}'
    )
    client = fake(_response(THINKING, _text(payload)))

    result = real_tailor_to_jd(make_content(), "Needs SQL and dbt.")
    assert result["match_score"] == 100  # still clamped
    assert result["missing_keywords"] == ["SQL", "dbt"]
    call = _only_call(client)
    assert "tools" not in call and "tool_choice" not in call
    assert call["output_config"]["format"] == {"type": "json_schema", "schema": service.TAILOR_SCHEMA}
    assert call["output_config"]["effort"] == "medium"


def test_sonnet_5_5_requests_carry_the_refusal_fallback(fake, settings):
    settings.AI_MODEL_TAILOR = "claude-sonnet-5-5"
    client = fake(_response(_text("Dear Hiring Manager, ...")))

    real_generate_cover_letter(make_content(), "A job.")
    assert not client.messages.calls
    (call,) = client.beta.messages.calls
    assert call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["fallbacks"] == [{"model": "claude-sonnet-5", "max_tokens": 4000}]


def test_other_tailor_models_skip_the_fallback(fake, settings):
    # The fallback list is only valid for claude-sonnet-5-5; an env override must not 400.
    settings.AI_MODEL_TAILOR = "claude-opus-5-5"
    client = fake(_response(_text("Dear Hiring Manager, ...")))

    real_generate_cover_letter(make_content(), "A job.")
    assert not client.beta.messages.calls
    assert "fallbacks" not in _only_call(client)


def test_ats_check_parses_json(fake):
    fake(_response(_text('{"score": 71, "issues": ["No dates"], "recommendations": ["Add dates"]}')))
    assert real_ats_health_check(make_content()) == {
        "score": 71, "issues": ["No dates"], "recommendations": ["Add dates"],
    }


def test_parse_resume_parses_json_and_normalizes(fake):
    fake(_response(_text(
        '{"personalInfo": {"name": "Maya Chen", "email": "not-an-email"}, "summary": "",'
        ' "workExperience": [], "education": [], "skills": ["Figma"], "projects": []}'
    )))
    parsed = real_parse_resume("Maya Chen ...")
    assert parsed["personalInfo"]["name"] == "Maya Chen"
    assert parsed["personalInfo"]["email"] == ""  # still normalized
    assert parsed["skills"] == ["Figma"]


def test_malformed_json_is_a_service_error(fake):
    fake(_response(_text("not json")))
    with pytest.raises(AIServiceError):
        real_ats_health_check(make_content())


def test_refusal_raises_a_refused_error(fake):
    fake(_response(stop_reason="refusal", category="cyber"))
    with pytest.raises(AIRefusedError) as exc:
        real_improve_bullet("anything")
    assert exc.value.category == "cyber"


def test_cut_off_reply_is_an_error_not_partial_text(fake):
    fake(_response(_text("Shipped X, cutting"), stop_reason="max_tokens"))
    with pytest.raises(AIServiceError):
        real_improve_bullet("did X")
