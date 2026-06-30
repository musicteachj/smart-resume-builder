# Feature B — Import an Existing Résumé Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import a PDF/DOCX (or pasted text) résumé — Claude parses it into structured `ResumeContent`, the user reviews it, and on confirm a new résumé is created and opened in the editor. Cuts `0.12.0`.

**Architecture:** Text is extracted **client-side** (lazy `pdfjs-dist` / `mammoth`) and sent to a new Sonnet **forced-tool-use** parse endpoint that mirrors `tailor_to_jd`; the service assigns entry UUIDs and normalizes email/URL fields so the result passes the strict `ResumeContent` validation. An import **modal** drives input → parse → in-modal review (live `ResumeDocument` preview) → confirm, which reuses the existing `useCreateResume` mutation. Résumé is created only on confirm.

**Tech Stack:** Django 5.2 + DRF + drf-spectacular + Anthropic SDK (Sonnet via `AI_MODEL_TAILOR`); React 19 + TypeScript + Orval-generated client + RHF; `pdfjs-dist`, `mammoth` (client, lazy); Vitest + RTL; pytest.

---

## Important context (read before starting)

- **Hard rule — NO COMMITS.** Per `CLAUDE.md`, never `git commit`/`git push`. This plan uses **Checkpoint** steps instead; James reviews and commits. Work is on the `import-resume` branch (already created off `dev`).
- **Python:** use `server/.venv/bin/python` (3.12). Server tests: `npm run test:server` (or `server/.venv/bin/python server/manage.py test` is NOT used — this project uses pytest: `cd server && .venv/bin/pytest`). The root script `npm run test:server` runs pytest. Client: `npm run test:client -- <pattern>`. Full: `npm run test`.
- **The AI parse mirrors `tailor_to_jd`** (`server/apps/ai/service.py`): forced tool-use, normalize the tool input defensively, return a plain dict. Views follow the `_gate → service → record_usage → Response` pattern (`server/apps/ai/views.py`).
- **Strict validation downstream:** `apps/resumes/serializers.py` makes entry `id` **required** (`WorkExperienceSerializer`/`EducationSerializer`/`ProjectSerializer`), and `email` is `EmailField`, `linkedin`/`github`/`website` are `URLField`. The parse service MUST assign `id`s and coerce email/URLs to valid-or-empty, or the client's `createResume` call (which validates content) will 400.
- **Tests mock Claude** via the autouse `mock_claude` fixture in `server/apps/ai/tests/conftest.py` (monkeypatches `apps.ai.service.<fn>`). Add `parse_resume` there. Test the *normalization* helper directly (pure function, no mocking).
- After backend API changes, **regenerate the Orval client**: `npm run gen:api` (writes `client/openapi.yaml` + `client/src/api/generated/`; never hand-edit the generated dir).

## File structure

- `server/apps/ai/service.py` — `parse_resume()`, `PARSE_TOOL`, `_normalize_parsed()`
- `server/apps/ai/prompts.py` — `PARSE_RESUME` system prompt
- `server/apps/ai/serializers.py` — `ParseResumeRequestSerializer`, `ParseResumeResponseSerializer`
- `server/apps/ai/views.py` — `ParseResumeView`
- `server/apps/ai/urls.py` — `parse-resume` route
- `server/apps/ai/tests/test_parse.py` *(new)* — normalization + view tests; edit `tests/conftest.py`
- `client/src/api/generated/**` + `client/openapi.yaml` — regenerated
- `client/src/lib/extractResumeText.ts` *(new)* + `extractResumeText.test.ts`
- `client/src/features/dashboard/ImportResumeModal.tsx` *(new)* + test
- `client/src/features/dashboard/DashboardPage.tsx` — Import button + modal
- `client/package.json` — `pdfjs-dist`, `mammoth`
- Docs/meta: root `package.json` version, `CHANGELOG.md`, `CLAUDE.md`

---

## Task 1: Parse service + defensive normalization

**Files:**
- Modify: `server/apps/ai/service.py`
- Test: `server/apps/ai/tests/test_parse.py` *(new)*

- [ ] **Step 1: Write the failing normalization test**

Create `server/apps/ai/tests/test_parse.py`:

```python
from apps.ai.service import _normalize_parsed


def test_normalize_assigns_entry_ids_and_defaults():
    out = _normalize_parsed({
        "personalInfo": {"name": "Maya Chen"},
        "workExperience": [{"position": "PM", "bullets": ["Did things"]}],
    })
    assert out["personalInfo"]["name"] == "Maya Chen"
    assert out["summary"] == ""
    assert out["education"] == [] and out["projects"] == []
    assert out["skills"] == []
    w = out["workExperience"][0]
    assert w["id"] and len(w["id"]) >= 8          # uuid assigned
    assert w["position"] == "PM" and w["company"] == ""
    assert w["bullets"] == ["Did things"]


def test_normalize_cleans_email_and_urls():
    out = _normalize_parsed({
        "personalInfo": {
            "email": "not-an-email",
            "linkedin": "linkedin.com/in/maya",   # missing scheme
            "github": "garbage no-dot",            # not a url
            "website": "https://maya.dev",
        },
    })
    pi = out["personalInfo"]
    assert pi["email"] == ""                        # invalid dropped
    assert pi["linkedin"] == "https://linkedin.com/in/maya"   # scheme added
    assert pi["github"] == ""                       # unrecoverable dropped
    assert pi["website"] == "https://maya.dev"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && .venv/bin/pytest apps/ai/tests/test_parse.py -q`
Expected: FAIL — `cannot import name '_normalize_parsed'`.

- [ ] **Step 3: Implement the parse service**

Add to `server/apps/ai/service.py` (after the `tailor_to_jd` block):

```python
import re
import uuid

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean_str(value, maxlen: int) -> str:
    return (value if isinstance(value, str) else "").strip()[:maxlen]


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

    Assigns a UUID to every entry (the schema requires `id`) and forces
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
            "startDate": _clean_str(w.get("startDate"), 7),
            "endDate": _clean_str(w.get("endDate"), 7),
            "bullets": _clean_list(w.get("bullets"), 500, 12),
        }

    def edu(e):
        e = e if isinstance(e, dict) else {}
        return {
            "id": uuid.uuid4().hex,
            "school": _clean_str(e.get("school"), 120),
            "degree": _clean_str(e.get("degree"), 120),
            "field": _clean_str(e.get("field"), 120),
            "graduationDate": _clean_str(e.get("graduationDate"), 7),
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

    src = data
    return {
        "personalInfo": personal,
        "summary": _clean_str(src.get("summary"), 1000),
        "workExperience": [work(w) for w in (src.get("workExperience") or [])][:20],
        "education": [edu(e) for e in (src.get("education") or [])][:20],
        "skills": _clean_list(src.get("skills"), 60, 60),
        "projects": [proj(p) for p in (src.get("projects") or [])][:20],
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
```

- [ ] **Step 4: Run the normalization test to verify it passes**

Run: `cd server && .venv/bin/pytest apps/ai/tests/test_parse.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint** — do not commit.

---

## Task 2: Prompt, serializers, view, URL, view tests

**Files:**
- Modify: `server/apps/ai/prompts.py`, `server/apps/ai/serializers.py`, `server/apps/ai/views.py`, `server/apps/ai/urls.py`, `server/apps/ai/tests/conftest.py`
- Test: `server/apps/ai/tests/test_parse.py`

- [ ] **Step 1: Add the system prompt**

Append to `server/apps/ai/prompts.py`:

```python
PARSE_RESUME = """You are an expert résumé parser. Extract the résumé in the provided text into \
the structured fields of the submit_resume tool. Rules:
- Extract ONLY what is present. Never invent or embellish. Unknown fields = empty string or empty array.
- Keep bullet wording verbatim; split distinct accomplishments into separate bullets.
- Normalize dates to YYYY-MM. If a role is current, leave endDate empty. If only a year is known, use YYYY.
- Put a one-line professional title (if present near the name) in personalInfo.headline.
- Always call the submit_resume tool exactly once."""
```

- [ ] **Step 2: Add serializers**

Append to `server/apps/ai/serializers.py`:

```python
class ParseResumeRequestSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=20000)


class ParseResumeResponseSerializer(serializers.Serializer):
    content = ResumeContentSerializer()
    ai_usage = AIUsageSerializer()
```

(`ResumeContentSerializer` and `AIUsageSerializer` are already imported at the top of the file.)

- [ ] **Step 3: Add the view**

In `server/apps/ai/views.py`, add `ParseResumeRequestSerializer` and `ParseResumeResponseSerializer` to the existing serializer import block, then append:

```python
class ParseResumeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        operation_id="parse_resume",
        request=ParseResumeRequestSerializer,
        responses=ParseResumeResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = ParseResumeRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        if (over := _gate(user)) is not None:
            return over

        text = req.validated_data["text"]
        try:
            content = service.parse_resume(text)
        except AIServiceError as exc:
            record_usage(user, "parse-resume", input_length=len(text), output_length=0, success=False)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        record_usage(user, "parse-resume", input_length=len(text), output_length=len(str(content)), success=True)
        return Response({"content": content, "ai_usage": usage_snapshot(user)})
```

- [ ] **Step 4: Add the URL**

In `server/apps/ai/urls.py`, import `ParseResumeView` and add:

```python
    path("parse-resume", ParseResumeView.as_view(), name="parse-resume"),
```

- [ ] **Step 5: Extend the Claude mock**

In `server/apps/ai/tests/conftest.py`, inside the `mock_claude` fixture, add a `parse_resume` stub:

```python
    monkeypatch.setattr(
        "apps.ai.service.parse_resume",
        lambda text: {
            "personalInfo": {"name": "Maya Chen", "email": "maya@example.com",
                             "headline": "", "phone": "", "location": "",
                             "linkedin": "", "github": "", "website": ""},
            "summary": "Senior product designer.",
            "workExperience": [{"id": "w-imported", "company": "Meridian", "position": "Senior Product Designer",
                                "location": "", "startDate": "2022-01", "endDate": "", "bullets": ["Led redesign."]}],
            "education": [],
            "skills": ["Figma"],
            "projects": [],
        },
    )
```

- [ ] **Step 6: Add the view tests**

Append to `server/apps/ai/tests/test_parse.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.ai.models import AIUsageLog
from apps.ai import service

PARSE = "/api/ai/parse-resume"


@pytest.mark.django_db
def test_parse_requires_auth():
    assert APIClient().post(PARSE, {"text": "x"}, format="json").status_code == 401


@pytest.mark.django_db
def test_parse_happy_path(auth_client):
    res = auth_client.post(PARSE, {"text": "Maya Chen\nSenior Product Designer"}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["content"]["personalInfo"]["name"] == "Maya Chen"
    assert body["content"]["workExperience"][0]["id"]
    assert body["ai_usage"]["calls_today"] == 1
    assert AIUsageLog.objects.filter(feature="parse-resume", success=True).count() == 1


@pytest.mark.django_db
def test_parse_blank_text_rejected(auth_client):
    assert auth_client.post(PARSE, {"text": ""}, format="json").status_code == 400


@pytest.mark.django_db
def test_parse_ai_down_returns_502(auth_client, monkeypatch):
    def boom(text):
        raise service.AIServiceError("AI is not configured (missing ANTHROPIC_API_KEY).")
    monkeypatch.setattr("apps.ai.service.parse_resume", boom)
    res = auth_client.post(PARSE, {"text": "some resume text"}, format="json")
    assert res.status_code == 502
    assert AIUsageLog.objects.filter(feature="parse-resume", success=False).count() == 1
```

- [ ] **Step 7: Run the server tests**

Run: `cd server && .venv/bin/pytest apps/ai -q`
Expected: PASS (new parse tests + existing AI tests). Then full server suite: `npm run test:server` → green.

- [ ] **Step 8: Checkpoint** — do not commit.

---

## Task 3: Regenerate the Orval client

**Files:**
- Modify (generated): `client/openapi.yaml`, `client/src/api/generated/**`

- [ ] **Step 1: Ensure the backend is importable, then regenerate**

Run: `npm run gen:api`
Expected: command succeeds; `client/src/api/generated/` now contains an AI `parseResume` mutation hook (e.g. `useParseResume`) and the `parse-resume` path in `client/openapi.yaml`.

- [ ] **Step 2: Confirm the generated hook name + response type**

Run: `grep -rn "parseResume\|ParseResume" client/src/api/generated | head`
Expected: a `useParseResume` (or `useParseResume`-style) hook and a response type exposing `content: ResumeContent` + `ai_usage`. Note the exact hook + response type names — they are used verbatim in Task 5.

- [ ] **Step 3: Typecheck the generated output**

Run: `npm run typecheck`
Expected: green.

- [ ] **Step 4: Checkpoint** — do not commit.

---

## Task 4: Client-side text extraction

**Files:**
- Modify: `client/package.json` (deps)
- Create: `client/src/lib/extractResumeText.ts`
- Test: `client/src/lib/extractResumeText.test.ts`

- [ ] **Step 1: Install the extraction libraries**

Run (from `client/`): `npm install pdfjs-dist mammoth`
Expected: both added to `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `client/src/lib/extractResumeText.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { extractResumeText } from "./extractResumeText";

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getTextContent: () =>
            Promise.resolve({ items: [{ str: "Maya Chen" }, { str: "Senior Product Designer" }] }),
        }),
    }),
  }),
}));
vi.mock("mammoth", () => ({
  default: { extractRawText: () => Promise.resolve({ value: "Short" }) },
}));

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("extractResumeText", () => {
  it("extracts text from a PDF", async () => {
    const text = await extractResumeText(file("cv.pdf", "application/pdf"));
    expect(text).toContain("Maya Chen");
    expect(text).toContain("Senior Product Designer");
  });

  it("rejects an unsupported file type", async () => {
    await expect(extractResumeText(file("cv.png", "image/png"))).rejects.toThrow(/PDF or DOCX/);
  });

  it("rejects a near-empty extraction (likely scanned)", async () => {
    // mammoth returns "Short" (< threshold)
    await expect(
      extractResumeText(
        file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      ),
    ).rejects.toThrow(/scanned|paste/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:client -- extractResumeText`
Expected: FAIL — cannot find module `./extractResumeText`.

- [ ] **Step 4: Implement the extractor**

Create `client/src/lib/extractResumeText.ts`:

```ts
const MIN_CHARS = 30;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isDocx(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

/**
 * Extract plain text from a résumé file in the browser. PDF via pdf.js, DOCX via mammoth
 * (both lazy-loaded). The file never leaves the client; only the returned text is sent on.
 */
export async function extractResumeText(file: File): Promise<string> {
  let text: string;
  if (isPdf(file)) text = await extractPdf(file);
  else if (isDocx(file)) text = await extractDocx(file);
  else throw new Error("Unsupported file type — upload a PDF or DOCX, or paste text instead.");

  text = text.trim();
  if (text.length < MIN_CHARS) {
    throw new Error("Couldn't read text from this file. If it's a scanned image, paste the text instead.");
  }
  return text;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:client -- extractResumeText`
Expected: PASS (3 tests). Then `npm run typecheck` → green. If TS flags `content.items` element typing, the `("str" in it ? it.str : "")` guard narrows the `TextItem | TextMarkedContent` union — no `any` needed.

- [ ] **Step 6: Checkpoint** — `npm run lint` clean. Do not commit.

---

## Task 5: Import modal

**Files:**
- Create: `client/src/features/dashboard/ImportResumeModal.tsx`
- Test: `client/src/features/dashboard/ImportResumeModal.test.tsx`

> Replace `useParseResume` / the response field below with the **exact** generated names noted in Task 3 Step 2 if they differ.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/dashboard/ImportResumeModal.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImportResumeModal } from "./ImportResumeModal";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const parseMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("@/api/generated/ai/ai", () => ({
  useParseResume: () => ({ mutateAsync: parseMutate, isPending: false }),
}));
vi.mock("@/api/generated/resumes/resumes", () => ({
  useCreateResume: () => ({ mutateAsync: createMutate, isPending: false }),
}));

const parsed = {
  personalInfo: { name: "Maya Chen" },
  summary: "",
  workExperience: [],
  education: [],
  skills: [],
  projects: [],
};

describe("ImportResumeModal", () => {
  it("parses pasted text, shows the review, and creates on confirm", async () => {
    parseMutate.mockResolvedValue({ content: parsed, ai_usage: { calls_today: 1, daily_limit: 10 } });
    createMutate.mockResolvedValue({ id: "new-id" });
    render(<ImportResumeModal open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: "Maya Chen\nSenior Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /parse/i }));

    await screen.findByRole("button", { name: /open in editor/i });
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith("/resumes/new-id");
  });

  it("shows an error and stays on input when parsing fails", async () => {
    parseMutate.mockRejectedValue({ response: { status: 502, data: { detail: "AI down" } } });
    render(<ImportResumeModal open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: "some resume text here" } });
    fireEvent.click(screen.getByRole("button", { name: /parse/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open in editor/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:client -- ImportResumeModal`
Expected: FAIL — cannot find module `./ImportResumeModal`.

- [ ] **Step 3: Implement the modal**

Create `client/src/features/dashboard/ImportResumeModal.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useParseResume } from "@/api/generated/ai/ai";
import type { ResumeContent } from "@/api/generated/model";
import { useCreateResume } from "@/api/generated/resumes/resumes";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { aiErrorMessage } from "@/features/ai/aiError";
import { applyAiUsage } from "@/features/ai/aiUsage";
import { ResumeDocument } from "@/features/templates/ResumeDocument";

import { extractResumeText } from "@/lib/extractResumeText";

type Step = "input" | "parsing" | "review";

export function ImportResumeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const parse = useParseResume();
  const create = useCreateResume();
  const [step, setStep] = useState<Step>("input");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const [parsedContent, setParsedContent] = useState<ResumeContent | null>(null);

  const reset = () => {
    setStep("input");
    setFile(null);
    setPasted("");
    setError("");
    setParsedContent(null);
  };

  const runParse = async () => {
    setError("");
    setStep("parsing");
    try {
      const text = file ? await extractResumeText(file) : pasted.trim();
      if (text.length < 30) throw new Error("Add a file or paste your résumé text first.");
      const res = await parse.mutateAsync({ data: { text } });
      applyAiUsage(res.ai_usage);
      setParsedContent(res.content);
      setStep("review");
    } catch (err) {
      setError(aiErrorMessage(err));
      setStep("input");
    }
  };

  const confirm = async () => {
    if (!parsedContent) return;
    const created = await create.mutateAsync({
      data: { title: "Imported résumé", template: "classic", content: parsedContent },
    });
    navigate(`/resumes/${created.id}`);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      size="lg"
      title="Import a résumé"
      description="Upload a PDF or DOCX, or paste the text. Claude structures it — you review before anything is created."
    >
      {step === "review" && parsedContent ? (
        <div className="space-y-4">
          <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-white">
            <div className="pointer-events-none origin-top-left" style={{ width: 816, transform: "scale(0.62)" }}>
              <ResumeDocument content={parsedContent} template="classic" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Start over
            </Button>
            <Button size="sm" disabled={create.isPending} onClick={confirm}>
              Open in editor
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            type="file"
            accept=".pdf,.docx"
            aria-label="Upload résumé file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-surface-variant"
          />
          <div className="text-center text-xs text-muted-foreground">or</div>
          <Textarea
            aria-label="Paste résumé text"
            placeholder="Paste your résumé text here…"
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            {step === "parsing" && (
              <span className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" /> {file ? "Reading file…" : "Parsing with AI…"}
              </span>
            )}
            <Button size="sm" disabled={step === "parsing" || (!file && pasted.trim().length < 30)} onClick={runParse}>
              Parse résumé
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- ImportResumeModal`
Expected: PASS (2 tests). Then `npm run typecheck` → green. If the generated hook/response names differ from `useParseResume` / `res.content`, update the import and field access to match Task 3 Step 2 (and mirror in the test mock).

- [ ] **Step 5: Checkpoint** — `npm run lint` clean. Do not commit.

---

## Task 6: Dashboard "Import résumé" button

**Files:**
- Modify: `client/src/features/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Add the import button + modal**

In `DashboardPage.tsx`: add `import { ImportResumeModal } from "./ImportResumeModal";`, a `const [importOpen, setImportOpen] = useState(false);` alongside the other state, an "Import résumé" secondary button next to the existing "New résumé" button (find the header action area near `handleCreate`), and render `<ImportResumeModal open={importOpen} onOpenChange={setImportOpen} />`. Example for the button cluster:

```tsx
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            Import résumé
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={createResume.isPending}>
            New résumé
          </Button>
        </div>
```

(Match the existing markup — keep the current "New résumé" button's exact props/label; only add the Import button beside it and place `<ImportResumeModal … />` before the closing element of the page.)

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` and `npm run lint` → green. In `npm run dev`: the dashboard shows "Import résumé"; clicking opens the modal. (Full live parse needs `ANTHROPIC_API_KEY`; without it the modal surfaces a graceful 502 — that's expected.) Do not commit.

---

## Task 7: Verify whole suite, then docs + version

**Files:**
- Modify: root `package.json` (version), `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Full green gate**

Run (from repo root): `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: all green. Client tests grow by `extractResumeText` + `ImportResumeModal`; server by the parse tests. In the build output, confirm `pdfjs`/`mammoth` land in **separate lazy chunks** (not the main `index-*.js`) — evidence the dynamic imports code-split correctly.

- [ ] **Step 2: Manual smoke (needs `ANTHROPIC_API_KEY` in `.env` for a real parse)**

In `npm run dev`: Dashboard → "Import résumé" → paste a résumé (or upload a text-based PDF/DOCX) → "Parse résumé" → review the live preview → "Open in editor" creates the résumé and lands in the editor with fields populated. Also verify: an unsupported file and a blank input show friendly errors; "Start over" returns to input.

- [ ] **Step 3: Bump version**

Edit root `package.json`: `"version": "0.11.0"` → `"version": "0.12.0"`.

- [ ] **Step 4: Update `CHANGELOG.md`**

Add above `## [0.11.0]`, keep `## [Unreleased]`:

```markdown
## [0.12.0] - 2026-06-30

Feature B — import an existing résumé.

### Added
- **Import résumé**: a dashboard action to bring in an existing résumé. Text is extracted in the browser
  (PDF via `pdfjs-dist`, DOCX via `mammoth`, both lazy-loaded; the file never leaves the client), parsed by
  Claude (Sonnet) via a forced tool-use `parse-resume` endpoint into structured `ResumeContent`, then shown
  in an in-modal **review** (live `ResumeDocument` preview) — a new résumé is created only on confirm and
  opens in the editor.
- Backend `POST /api/ai/parse-resume` mirrors the tailor endpoint (usage-gated, recorded as `parse-resume`,
  graceful 502 without an API key); the parse service assigns entry UUIDs and normalizes email/URL fields so
  the result passes the strict résumé-content validation.
- Tests: parse normalization (ids, email/URL coercion), the parse view (gate/usage/502), `extractResumeText`
  (PDF/DOCX/empty/unsupported), and the import modal (parse → review → create, plus error handling).

### Notes
- Import counts against the AI usage limits (10/day · 50/month). Text-based PDFs only — no OCR for scans.
```

Then update the compare links at the bottom: add `[0.12.0]` and point `[Unreleased]` at `v0.12.0...HEAD`.

- [ ] **Step 5: Update `CLAUDE.md` phase status**

Add under the Feature C entry:

```markdown
- ✅ Feature B — import an existing résumé (`0.12.0`): client-side text extraction (`pdfjs-dist`/`mammoth`,
  lazy), Sonnet `parse-resume` tool-use endpoint → `ResumeContent` (entry UUIDs + email/URL normalization,
  usage-gated), and an `ImportResumeModal` (upload/paste → AI parse → in-modal review → create on confirm).
```

- [ ] **Step 6: Final checkpoint**

Run: `npm run test && npm run build`
Expected: green. **STOP — do not commit.** Report to James for review; he commits himself.

---

## Self-review notes

- **Spec coverage:** client extraction → Task 4; parse endpoint (service/prompt/serializers/view/url) → Tasks 1–2; Orval regen → Task 3; import modal w/ review → Task 5; dashboard entry → Task 6; tests throughout; docs/version → Task 7. Non-goals (server file storage, OCR, separate review route, bulk/LinkedIn) untouched.
- **Strict-validation risk handled:** `_normalize_parsed` assigns entry UUIDs and coerces email/URLs to valid-or-empty (Task 1), so the client `createResume` (which validates `ResumeContent`) won't 400 on a parse.
- **Placeholder scan:** thresholds (30 chars, 20000 max), the full tool schema, prompt text, and all test bodies are concrete. The one deliberate variable is the generated hook name (`useParseResume`) — Task 3 Step 2 pins it down and Tasks 5 flags the substitution.
- **Type consistency:** `parse_resume(text) -> dict` and `_normalize_parsed(data) -> dict` (Task 1) feed `ParseResumeView` (Task 2) → `{content, ai_usage}`; the client `useParseResume` returns `{ content: ResumeContent, ai_usage }`, consumed in Task 5 and createResume `{ title, template, content }` matches the existing `handleCreate` shape.
- **Commits:** none — every Task ends in a Checkpoint; James reviews and commits.
```
