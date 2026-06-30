"""Claude service — the only place that talks to the Anthropic API.

Model routing (settings, env-overridable): Haiku for the simple rewrites,
Sonnet for the reasoning-heavy tailor-to-JD. Opus/Fable are never used.

Structured output for tailor-to-JD uses tool-use with a forced tool call — the
most robust way to get reliable JSON out of both Haiku and Sonnet.
"""

from __future__ import annotations

import functools
import re
import uuid

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


# --- import / parse ---------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")  # YYYY-MM — must match the resume serializer
_YM_RE = re.compile(r"^(\d{4})-(\d{1,2})$")


def _clean_str(value, maxlen: int) -> str:
    return (value if isinstance(value, str) else "").strip()[:maxlen]


def _clean_month(value) -> str:
    """Coerce a date to strict YYYY-MM or empty.

    The resume serializer's MonthField only accepts ``YYYY-MM``. The model may emit a
    single-digit month ("2022-1"), a year only ("2017"), or words ("Present"); we
    zero-pad recoverable months and drop everything else to "" (the user fills it in
    the editor) so the downstream create never 400s.
    """
    s = _clean_str(value, 7)
    if not s or _MONTH_RE.match(s):
        return s
    m = _YM_RE.match(s)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    return ""


def _clean_email(value) -> str:
    s = _clean_str(value, 254)
    return s if _EMAIL_RE.match(s) else ""


def _clean_url(value) -> str:
    s = _clean_str(value, 200)
    if not s:
        return ""
    if not s.startswith(("http://", "https://")):
        s = "https://" + s
    # Require a dot in the host so bare garbage ("https://foo") is dropped.
    host = s.split("//", 1)[1].split("/", 1)[0]
    return s if "." in host else ""


def _clean_list(value, maxlen: int, max_items: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out = [_clean_str(v, maxlen) for v in value]
    return [v for v in out if v][:max_items]


def _normalize_parsed(data: dict) -> dict:
    """Coerce the model's tool output into valid, editor-ready ResumeContent.

    Assigns a UUID to every entry (the schema requires ``id``) and forces
    email/URL fields to valid-or-empty so the downstream create endpoint
    (strict EmailField/URLField) never rejects an import.
    """
    data = data if isinstance(data, dict) else {}
    pi = data.get("personalInfo") or {}
    personal = {
        "name": _clean_str(pi.get("name"), 100),
        "headline": _clean_str(pi.get("headline"), 120),
        "email": _clean_email(pi.get("email")),
        "phone": _clean_str(pi.get("phone"), 40),
        "location": _clean_str(pi.get("location"), 100),
        "linkedin": _clean_url(pi.get("linkedin")),
        "github": _clean_url(pi.get("github")),
        "website": _clean_url(pi.get("website")),
    }

    def work(w):
        w = w if isinstance(w, dict) else {}
        return {
            "id": uuid.uuid4().hex,
            "company": _clean_str(w.get("company"), 120),
            "position": _clean_str(w.get("position"), 120),
            "location": _clean_str(w.get("location"), 120),
            "startDate": _clean_month(w.get("startDate")),
            "endDate": _clean_month(w.get("endDate")),
            "bullets": _clean_list(w.get("bullets"), 500, 12),
        }

    def edu(e):
        e = e if isinstance(e, dict) else {}
        return {
            "id": uuid.uuid4().hex,
            "school": _clean_str(e.get("school"), 120),
            "degree": _clean_str(e.get("degree"), 120),
            "field": _clean_str(e.get("field"), 120),
            "graduationDate": _clean_month(e.get("graduationDate")),
            "gpa": _clean_str(e.get("gpa"), 10),
        }

    def proj(p):
        p = p if isinstance(p, dict) else {}
        return {
            "id": uuid.uuid4().hex,
            "name": _clean_str(p.get("name"), 120),
            "description": _clean_str(p.get("description"), 500),
            "url": _clean_url(p.get("url")),
            "technologies": _clean_list(p.get("technologies"), 50, 20),
        }

    return {
        "personalInfo": personal,
        "summary": _clean_str(data.get("summary"), 1000),
        "workExperience": [work(w) for w in (data.get("workExperience") or [])][:20],
        "education": [edu(e) for e in (data.get("education") or [])][:20],
        "skills": _clean_list(data.get("skills"), 60, 60),
        "projects": [proj(p) for p in (data.get("projects") or [])][:20],
    }


PARSE_TOOL = {
    "name": "submit_resume",
    "description": "Submit the structured résumé extracted from the provided text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "personalInfo": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"}, "headline": {"type": "string"},
                    "email": {"type": "string"}, "phone": {"type": "string"},
                    "location": {"type": "string"}, "linkedin": {"type": "string"},
                    "github": {"type": "string"}, "website": {"type": "string"},
                },
            },
            "summary": {"type": "string"},
            "workExperience": {"type": "array", "items": {"type": "object", "properties": {
                "company": {"type": "string"}, "position": {"type": "string"},
                "location": {"type": "string"}, "startDate": {"type": "string"},
                "endDate": {"type": "string"}, "bullets": {"type": "array", "items": {"type": "string"}},
            }}},
            "education": {"type": "array", "items": {"type": "object", "properties": {
                "school": {"type": "string"}, "degree": {"type": "string"},
                "field": {"type": "string"}, "graduationDate": {"type": "string"}, "gpa": {"type": "string"},
            }}},
            "skills": {"type": "array", "items": {"type": "string"}},
            "projects": {"type": "array", "items": {"type": "object", "properties": {
                "name": {"type": "string"}, "description": {"type": "string"},
                "url": {"type": "string"}, "technologies": {"type": "array", "items": {"type": "string"}},
            }}},
        },
        "required": ["personalInfo", "workExperience", "education", "skills"],
    },
}


def parse_resume(text: str) -> dict:
    from .prompts import PARSE_RESUME

    try:
        resp = _client().messages.create(
            model=settings.AI_MODEL_TAILOR,
            max_tokens=4096,
            system=PARSE_RESUME,
            tools=[PARSE_TOOL],
            tool_choice={"type": "tool", "name": "submit_resume"},
            messages=[{"role": "user", "content": f"Résumé text:\n\n{text}"}],
        )
    except AIServiceError:
        raise
    except Exception as exc:
        raise AIServiceError(str(exc)) from exc

    data = next((b.input for b in resp.content if getattr(b, "type", None) == "tool_use"), None)
    if not isinstance(data, dict):
        raise AIServiceError("Malformed response from the AI service.")
    return _normalize_parsed(data)
