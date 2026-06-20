"""Claude service — the only place that talks to the Anthropic API.

Model routing (settings, env-overridable): Haiku for the simple rewrites,
Sonnet for the reasoning-heavy tailor-to-JD. Opus/Fable are never used.

Structured output for tailor-to-JD uses tool-use with a forced tool call — the
most robust way to get reliable JSON out of both Haiku and Sonnet.
"""

from __future__ import annotations

import functools

from django.conf import settings


class AIServiceError(Exception):
    """Raised when an AI call cannot be completed (config or upstream error)."""


@functools.lru_cache(maxsize=1)
def _client():
    if not settings.ANTHROPIC_API_KEY:
        raise AIServiceError("AI is not configured (missing ANTHROPIC_API_KEY).")
    import anthropic

    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _text_from(message) -> str:
    """Join all text blocks of a Messages API response."""
    return "".join(b.text for b in message.content if getattr(b, "type", None) == "text").strip()


# --- content formatting -----------------------------------------------------

def _content_to_text(content: dict, *, with_bullet_ids: bool = False) -> str:
    """Render resume content as compact plain text for the prompt."""
    pi = content.get("personalInfo") or {}
    lines: list[str] = []
    if pi.get("name"):
        lines.append(f"Name: {pi['name']}")
    if content.get("summary"):
        lines.append(f"Summary: {content['summary']}")

    work = content.get("workExperience") or []
    if work:
        lines.append("\nExperience:")
        for w in work:
            header = " — ".join(p for p in [w.get("position"), w.get("company")] if p)
            lines.append(f"- {header}".rstrip())
            for b in w.get("bullets") or []:
                if not b:
                    continue
                if with_bullet_ids:
                    lines.append(f"    [{w.get('id')}::{(w.get('bullets') or []).index(b)}] {b}")
                else:
                    lines.append(f"    • {b}")

    edu = content.get("education") or []
    if edu:
        lines.append("\nEducation:")
        for e in edu:
            lines.append(f"- {' , '.join(p for p in [e.get('degree'), e.get('field'), e.get('school')] if p)}")

    skills = content.get("skills") or []
    if skills:
        lines.append("\nSkills: " + ", ".join(skills))

    projects = content.get("projects") or []
    if projects:
        lines.append("\nProjects:")
        for p in projects:
            lines.append(f"- {p.get('name', '')}: {p.get('description', '')}".rstrip())

    return "\n".join(lines).strip()


# --- features ---------------------------------------------------------------

def improve_bullet(text: str, role: str = "") -> str:
    from .prompts import IMPROVE_BULLET

    context = f"Target role: {role}\n\n" if role else ""
    user = f"{context}Rewrite this resume bullet:\n\n{text}"
    try:
        resp = _client().messages.create(
            model=settings.AI_MODEL_SIMPLE,
            max_tokens=256,
            system=IMPROVE_BULLET,
            messages=[{"role": "user", "content": user}],
        )
    except AIServiceError:
        raise
    except Exception as exc:  # anthropic / network errors
        raise AIServiceError(str(exc)) from exc
    out = _text_from(resp)
    if not out:
        raise AIServiceError("Empty response from the AI service.")
    return out


def generate_summary(content: dict) -> str:
    from .prompts import GENERATE_SUMMARY

    user = "Write a professional summary for this resume:\n\n" + _content_to_text(content)
    try:
        resp = _client().messages.create(
            model=settings.AI_MODEL_SIMPLE,
            max_tokens=512,
            system=GENERATE_SUMMARY,
            messages=[{"role": "user", "content": user}],
        )
    except AIServiceError:
        raise
    except Exception as exc:
        raise AIServiceError(str(exc)) from exc
    out = _text_from(resp)
    if not out:
        raise AIServiceError("Empty response from the AI service.")
    return out


TAILOR_TOOL = {
    "name": "submit_tailoring",
    "description": "Submit the ATS match analysis and tailored bullet suggestions.",
    "input_schema": {
        "type": "object",
        "properties": {
            "match_score": {
                "type": "integer",
                "description": "0-100 estimate of how well the resume matches the job description.",
            },
            "missing_keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Important job-description terms absent/weak in the resume (most important first).",
            },
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "bullet_id": {"type": "string", "description": "The id token shown in brackets next to the bullet."},
                        "current": {"type": "string"},
                        "suggested": {"type": "string"},
                        "adds": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["bullet_id", "current", "suggested", "adds"],
                },
            },
        },
        "required": ["match_score", "missing_keywords", "suggestions"],
    },
}


def tailor_to_jd(content: dict, job_description: str) -> dict:
    from .prompts import TAILOR_JD

    user = (
        "Resume:\n"
        + _content_to_text(content, with_bullet_ids=True)
        + "\n\nJob description:\n"
        + job_description
    )
    try:
        resp = _client().messages.create(
            model=settings.AI_MODEL_TAILOR,
            max_tokens=2048,
            system=TAILOR_JD,
            tools=[TAILOR_TOOL],
            tool_choice={"type": "tool", "name": "submit_tailoring"},
            messages=[{"role": "user", "content": user}],
        )
    except AIServiceError:
        raise
    except Exception as exc:
        raise AIServiceError(str(exc)) from exc

    data = next(
        (b.input for b in resp.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if not isinstance(data, dict):
        raise AIServiceError("Malformed response from the AI service.")

    # Defensive normalization.
    score = data.get("match_score", 0)
    try:
        score = max(0, min(100, int(score)))
    except (TypeError, ValueError):
        score = 0
    return {
        "match_score": score,
        "missing_keywords": [str(k) for k in (data.get("missing_keywords") or [])][:12],
        "suggestions": data.get("suggestions") or [],
    }
