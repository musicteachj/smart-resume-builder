"""Claude service: the only place that talks to the Anthropic API.

Model routing (settings, env-overridable): Claude Haiku 5.5 for the short rewrites,
Claude Sonnet 5.5 for tailoring, cover letters, the ATS check, and import. Every call
goes through `_call`, which sets the effort level, and turns a refusal or a cut-off
reply into an error instead of returning partial output.

Both models think before answering (adaptive thinking is on by default), and thinking
counts toward `max_tokens`, so the caps below leave room for it. Tailoring, the ATS
check, and import get JSON back through structured outputs (`output_config.format`):
these models don't accept a forced tool call.
"""

from __future__ import annotations

import functools
import json
import logging
import re
import uuid

from django.conf import settings
from django.db import Error as DBError  # the base of every database error, InterfaceError included
from django.utils import timezone

from . import ledger
from .pricing import Attempt, input_token_bound, reservation_micros, served_cost_micros

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    """Raised when an AI call cannot be completed (config or upstream error)."""


_BUDGET_MESSAGES = {
    "off": "Live AI is off.",
    "daily": "Today's AI budget is used up.",
    "visitor": "This demo's AI allowance is used up.",
}


class AIBudgetRefusedError(AIServiceError):
    """The dollar ledger refused the call before anything was sent. `scope` is "off", "daily", or "visitor"."""

    def __init__(self, scope: str):
        super().__init__(_BUDGET_MESSAGES.get(scope, "The AI budget does not allow this call."))
        self.scope = scope


class AIProviderLimitError(AIServiceError):
    """Anthropic rejected the call because the account's spend limit or credit balance is used up."""


class AIUnavailableError(AIServiceError):
    """The call failed upstream or could not be made (network, overload, ledger outage)."""


class AIRefusedError(AIServiceError):
    """Claude declined the request (`stop_reason: "refusal"`). Shown to the user, not masked."""

    message = "Claude couldn't help with this request. Try rewording it, or remove any unusual content."

    def __init__(self, category: str | None = None):
        super().__init__(self.message)
        self.category = category


@functools.lru_cache(maxsize=1)
def _client():
    if not settings.ANTHROPIC_API_KEY:
        raise AIServiceError("AI is not configured (missing ANTHROPIC_API_KEY).")
    import anthropic

    # One attempt, cut before the ALB's idle timeout: a slow Sonnet call fails
    # cleanly (and uncharged, so the user can retry) rather than the ALB 504ing a
    # call that still completes and bills the quota. The SDK default is 10 min + 2 retries.
    return anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=settings.AI_TIMEOUT_SECONDS,
        max_retries=0,
    )


def _simple_client():
    """Haiku calls are quick: a short timeout, one attempt."""
    # No SDK retries: a retry is a second paid attempt outside its reservation, and 3 x 30 s plus
    # backoff could outlast the load balancer.
    return _client().with_options(timeout=settings.AI_SIMPLE_TIMEOUT_SECONDS, max_retries=0)


def _text_from(message) -> str:
    """Join all text blocks of a Messages API response (thinking blocks are skipped)."""
    return "".join(b.text for b in message.content if getattr(b, "type", None) == "text").strip()


# Server-side refusal fallback (beta): if Claude Sonnet 5.5 declines, the API re-runs the
# request on Claude Sonnet 5 inside the same call. The fallback list is only valid for
# this model, so other models (an env override) go through the plain endpoint. The second
# pass has its own explicit `max_tokens`, and the ledger reserves for both passes.
_FALLBACKS = {"claude-sonnet-5-5": "claude-sonnet-5"}
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_USAGE_LIMIT_400 = re.compile(r"You have reached your specified (?:workspace |organization )?API usage limits", re.I)
_CREDIT_400 = re.compile(r"credit balance is too low", re.I)


def _error_text(exc) -> str:
    body = getattr(exc, "body", None)
    inner = body.get("error") if isinstance(body, dict) else None
    detail = inner.get("message") if isinstance(inner, dict) else ""
    return f"{exc} {detail or ''}"


def _classify(exc: Exception) -> tuple[type[AIServiceError], bool]:
    """The error to raise for a failed call, and whether Anthropic is known not to have billed it.

    Only rejections made before any work is done are unbilled: 401, 402, 403, any 429 (rate limit or
    spend cap), 529, and the 400s for a used-up usage limit or credit balance. A timeout, a dropped
    connection, a 5xx, or any other 400 may have been billed, so those keep the full reservation.
    """
    status = getattr(exc, "status_code", None)
    if status is None:
        return AIUnavailableError, False
    text = _error_text(exc)
    if status == 402 or (status == 400 and (_USAGE_LIMIT_400.search(text) or _CREDIT_400.search(text))):
        return AIProviderLimitError, True
    if status == 429:
        body = getattr(exc, "body", None)
        inner = body.get("error") if isinstance(body, dict) else None
        code = inner.get("error_code") if isinstance(inner, dict) else None
        return (AIProviderLimitError if code == "enforced_spend_limit_reached" else AIUnavailableError), True
    return AIUnavailableError, status in (401, 403, 529)


def _settle(reservation, actual_micros: int, how: str) -> None:
    """Settle quietly: a ledger failure must not lose a finished answer. The sweeper charges the
    reservation in full later."""
    try:
        ledger.settle(reservation, actual_micros, how=how)
    except DBError:
        logger.error("AI ledger settle failed: reservation=%s how=%s", reservation.id, how, exc_info=True)


def _call(client, *, model: str, effort: str, feature: str, visitor_id: int | None, **kwargs):
    """Reserve the worst case, send one Messages request, settle from real usage, check how it ended.

    Raises AIBudgetRefusedError (nothing sent) if the ledger refuses, AIRefusedError on a refusal and
    AIServiceError on any upstream error or a reply cut off at `max_tokens` (partial JSON or a
    half-sentence is never returned). No transaction is open while the model call runs.
    """
    params = {"model": model, "output_config": {"effort": effort, **kwargs.pop("output_config", {})}, **kwargs}
    max_tokens = params["max_tokens"]
    fallback = _FALLBACKS.get(model) if settings.AI_SERVER_SIDE_FALLBACK else None
    attempts = [Attempt(model, max_tokens)] + ([Attempt(fallback, max_tokens)] if fallback else [])
    bound = input_token_bound(
        system=params.get("system", ""), messages=params["messages"], output_config=params["output_config"]
    )
    amount = reservation_micros(attempts, bound)
    try:
        reservation = ledger.reserve(amount_micros=amount, feature=feature, model=model, visitor_id=visitor_id)
    except ledger.BudgetRefused as refused:
        raise AIBudgetRefusedError(refused.scope) from refused
    except DBError as exc:
        logger.error("AI ledger reserve failed: feature=%s", feature, exc_info=True)
        raise AIUnavailableError("The AI budget could not be checked.") from exc

    try:
        if fallback:
            resp = client.beta.messages.create(
                betas=[_FALLBACK_BETA], fallbacks=[{"model": fallback, "max_tokens": max_tokens}], **params
            )
        else:
            resp = client.messages.create(**params)
    except Exception as exc:  # anthropic / network errors
        error, unbilled = _classify(exc)
        _settle(reservation, 0 if unbilled else amount, "unbilled" if unbilled else "kept")
        logger.warning(
            "AI call failed: feature=%s model=%s reserved=%s actual=%s how=%s",
            feature, model, amount, 0 if unbilled else amount, "unbilled" if unbilled else "kept",
        )
        raise error(str(exc)) from exc

    try:
        actual, how = served_cost_micros(resp, requested_model=model), "usage"
    except Exception:  # unreadable usage: assume the worst
        logger.error("AI usage unreadable: feature=%s model=%s", feature, model, exc_info=True)
        actual, how = amount, "kept"
    _settle(reservation, actual, how)
    usage = getattr(resp, "usage", None)
    served = getattr(usage, "iterations", None) or [usage]
    if any((getattr(item, "input_tokens", 0) or 0) > bound for item in served):
        logger.warning("AI input exceeded its bound: feature=%s model=%s bound=%s", feature, model, bound)
    logger.info("AI call: feature=%s model=%s reserved=%s actual=%s how=%s", feature, model, amount, actual, how)

    if resp.stop_reason == "refusal":
        raise AIRefusedError(getattr(resp.stop_details, "category", None))
    if resp.stop_reason == "max_tokens":
        raise AIServiceError("The AI response was cut off before it finished.")
    return resp


def _json_from(message) -> dict:
    """The JSON object a structured-output response carries in its text block."""
    try:
        data = json.loads(_text_from(message))
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise AIServiceError("Malformed response from the AI service.")
    return data


def _json_format(schema: dict) -> dict:
    return {"format": {"type": "json_schema", "schema": schema}}


# --- content formatting -----------------------------------------------------

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Contact fields Claude is told exist (by name only: their values aren't needed to judge the résumé).
_CONTACT_FIELDS = [("email", "email"), ("phone", "phone"), ("linkedin", "LinkedIn"), ("github", "GitHub"),
                   ("website", "website")]


def _month(value) -> str:
    """'2022-03' -> 'Mar 2022'; anything else passes through."""
    if isinstance(value, str) and len(value) == 7 and value[4] == "-" and value[5:].isdigit():
        month = int(value[5:])
        if 1 <= month <= 12:
            return f"{_MONTHS[month - 1]} {value[:4]}"
    return value or ""


def _content_to_text(content: dict, *, with_bullet_ids: bool = False) -> str:
    """Render resume content as compact plain text for the prompt.

    Includes dates, locations, and the headline (the ATS check, summary, and tailoring all depend on them),
    and says which contact details exist without sending their values. Opens with today's date: the model
    doesn't know it, so "years of experience" for a role running to the present would otherwise be a guess.
    The date goes here, in the user message, not in the system prompts, so those stay identical across calls.
    """
    today = timezone.now().date()
    pi = content.get("personalInfo") or {}
    lines: list[str] = [f"Today's date: {today:%B} {today.day}, {today.year}"]
    if pi.get("name"):
        lines.append(f"Name: {pi['name']}")
    if pi.get("headline"):
        lines.append(f"Headline: {pi['headline']}")
    if pi.get("location"):
        lines.append(f"Location: {pi['location']}")
    present = [label for key, label in _CONTACT_FIELDS if pi.get(key)]
    lines.append(f"Contact details on the résumé: {', '.join(present) or 'none'}")
    if content.get("summary"):
        lines.append(f"Summary: {content['summary']}")

    work = content.get("workExperience") or []
    if work:
        lines.append("\nExperience:")
        for w in work:
            where = ", ".join(p for p in [w.get("company"), w.get("location")] if p)
            header = " at ".join(p for p in [w.get("position"), where] if p)
            if w.get("startDate"):
                header += f" ({_month(w['startDate'])} to {_month(w.get('endDate')) or 'Present'})"
            lines.append(f"- {header}".rstrip())
            for index, b in enumerate(w.get("bullets") or []):
                if not b:
                    continue
                if with_bullet_ids:
                    lines.append(f"    [{w.get('id')}::{index}] {b}")
                else:
                    lines.append(f"    • {b}")

    edu = content.get("education") or []
    if edu:
        lines.append("\nEducation:")
        for e in edu:
            entry = ", ".join(p for p in [e.get("degree"), e.get("field"), e.get("school")] if p)
            if e.get("graduationDate"):
                entry += f" ({_month(e['graduationDate'])})"
            lines.append(f"- {entry}")

    skills = content.get("skills") or []
    if skills:
        lines.append("\nSkills: " + ", ".join(skills))

    projects = content.get("projects") or []
    if projects:
        lines.append("\nProjects:")
        for p in projects:
            lines.append(f"- {p.get('name', '')}: {p.get('description', '')}".rstrip())

    # Bound the input cost per call: valid content can reach ~160k characters, far more
    # than any real résumé (typically 3-8k).
    return "\n".join(lines).strip()[: settings.AI_MAX_PROMPT_CHARS]


# --- features ---------------------------------------------------------------

def improve_bullet(text: str, role: str = "", *, visitor_id: int | None = None) -> str:
    from .prompts import IMPROVE_BULLET

    context = f"Target role: {role}\n\n" if role else ""
    user = f"{context}Rewrite this resume bullet:\n\n{text}"
    resp = _call(
        _simple_client(),
        model=settings.AI_MODEL_SIMPLE,
        effort="low",
        feature="improve-bullet",
        visitor_id=visitor_id,
        max_tokens=1024,
        system=IMPROVE_BULLET,
        messages=[{"role": "user", "content": user}],
    )
    out = _text_from(resp)
    if not out:
        raise AIServiceError("Empty response from the AI service.")
    return out


def generate_summary(content: dict, *, visitor_id: int | None = None) -> str:
    from .prompts import GENERATE_SUMMARY

    user = "Write a professional summary for this resume:\n\n" + _content_to_text(content)
    resp = _call(
        _simple_client(),
        model=settings.AI_MODEL_SIMPLE,
        effort="low",
        feature="generate-summary",
        visitor_id=visitor_id,
        max_tokens=1536,
        system=GENERATE_SUMMARY,
        messages=[{"role": "user", "content": user}],
    )
    out = _text_from(resp)
    if not out:
        raise AIServiceError("Empty response from the AI service.")
    return out


TAILOR_SCHEMA = {
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
                "additionalProperties": False,
            },
        },
    },
    "required": ["match_score", "missing_keywords", "suggestions"],
    "additionalProperties": False,
}


def tailor_to_jd(content: dict, job_description: str, *, visitor_id: int | None = None) -> dict:
    from .prompts import TAILOR_JD

    user = (
        "Resume:\n"
        + _content_to_text(content, with_bullet_ids=True)
        + "\n\nJob description:\n"
        + job_description
    )
    resp = _call(
        _client(),
        model=settings.AI_MODEL_TAILOR,
        # Judging fit and rewriting bullets is the one route that gains from more thinking.
        effort="medium",
        feature="tailor-jd",
        visitor_id=visitor_id,
        max_tokens=8000,
        system=TAILOR_JD,
        output_config=_json_format(TAILOR_SCHEMA),
        messages=[{"role": "user", "content": user}],
    )
    data = _json_from(resp)

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


def generate_cover_letter(content: dict, job_description: str, *, visitor_id: int | None = None) -> str:
    from .prompts import COVER_LETTER

    user = "Resume:\n" + _content_to_text(content) + "\n\nJob description:\n" + job_description
    resp = _call(
        _client(),
        model=settings.AI_MODEL_TAILOR,
        effort="low",
        feature="cover-letter",
        visitor_id=visitor_id,
        max_tokens=4000,
        system=COVER_LETTER,
        messages=[{"role": "user", "content": user}],
    )
    out = _text_from(resp)
    if not out:
        raise AIServiceError("Empty response from the AI service.")
    return out


ATS_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "description": "0-100 overall ATS readiness / quality."},
        "issues": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Specific problems with the resume, most important first.",
        },
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Actionable improvements, most impactful first.",
        },
    },
    "required": ["score", "issues", "recommendations"],
    "additionalProperties": False,
}


def ats_health_check(content: dict, *, visitor_id: int | None = None) -> dict:
    from .prompts import ATS_HEALTH_CHECK

    user = "Review this resume:\n\n" + _content_to_text(content)
    resp = _call(
        _client(),
        model=settings.AI_MODEL_TAILOR,
        effort="low",
        feature="ats-check",
        visitor_id=visitor_id,
        max_tokens=4000,
        system=ATS_HEALTH_CHECK,
        output_config=_json_format(ATS_SCHEMA),
        messages=[{"role": "user", "content": user}],
    )
    data = _json_from(resp)

    score = data.get("score", 0)
    try:
        score = max(0, min(100, int(score)))
    except (TypeError, ValueError):
        score = 0
    return {
        "score": score,
        "issues": [str(s) for s in (data.get("issues") or [])][:8],
        "recommendations": [str(s) for s in (data.get("recommendations") or [])][:8],
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
    """Coerce the model's JSON output into valid, editor-ready ResumeContent.

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

    # The same caps the résumé serializer enforces, so an import is always saveable.
    from apps.resumes.serializers import ResumeContentSerializer

    cap = ResumeContentSerializer.MAX_ITEMS
    return {
        "personalInfo": personal,
        "summary": _clean_str(data.get("summary"), 1000),
        "workExperience": [work(w) for w in (data.get("workExperience") or [])][: cap["workExperience"]],
        "education": [edu(e) for e in (data.get("education") or [])][: cap["education"]],
        "skills": _clean_list(data.get("skills"), 60, 60),
        "projects": [proj(p) for p in (data.get("projects") or [])][: cap["projects"]],
    }


_STR = {"type": "string"}
_STRS = {"type": "array", "items": _STR}


def _obj(properties: dict) -> dict:
    """A structured-output object with every field required. Structured outputs allow at
    most 24 optional fields per schema; the prompt has Claude send "" or [] for anything
    the résumé doesn't have, and `_normalize_parsed` cleans the result either way."""
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


PARSE_SCHEMA = _obj(
    {
        "personalInfo": _obj({
            "name": _STR, "headline": _STR, "email": _STR, "phone": _STR,
            "location": _STR, "linkedin": _STR, "github": _STR, "website": _STR,
        }),
        "summary": _STR,
        "workExperience": {"type": "array", "items": _obj({
            "company": _STR, "position": _STR, "location": _STR,
            "startDate": _STR, "endDate": _STR, "bullets": _STRS,
        })},
        "education": {"type": "array", "items": _obj({
            "school": _STR, "degree": _STR, "field": _STR, "graduationDate": _STR, "gpa": _STR,
        })},
        "skills": _STRS,
        "projects": {"type": "array", "items": _obj({
            "name": _STR, "description": _STR, "url": _STR, "technologies": _STRS,
        })},
    },
)


def parse_resume(text: str, *, visitor_id: int | None = None) -> dict:
    from .prompts import PARSE_RESUME

    resp = _call(
        _client(),
        model=settings.AI_MODEL_TAILOR,
        # Extraction, not judgment: low effort keeps a long résumé inside the timeout.
        effort="low",
        feature="parse-resume",
        visitor_id=visitor_id,
        max_tokens=12000,
        system=PARSE_RESUME,
        output_config=_json_format(PARSE_SCHEMA),
        messages=[{"role": "user", "content": f"Résumé text:\n\n{text}"}],
    )
    return _normalize_parsed(_json_from(resp))
