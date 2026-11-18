import type { Page, Route } from "@playwright/test";

import type {
  AIUsage,
  AtsCheckResponse,
  CoverLetterResponse,
  GenerateSummaryResponse,
  ImproveBulletResponse,
  ParseResumeResponse,
  ResumeContent,
  TailorJDResponse,
} from "../../src/api/generated/model";

/**
 * Fixtures for every `/api/ai/` endpoint, typed against the generated client so they stay
 * in step with the API. The suite never reaches Anthropic: the e2e Django has no key, and
 * these routes answer before a request leaves the browser.
 */
export const AI_USAGE: AIUsage = {
  calls_today: 1,
  calls_this_month: 1,
  daily_limit: 10,
  monthly_limit: 50,
  is_admin: false,
};

export const IMPROVED_BULLET =
  "Cut checkout latency 38% by rebuilding the payment service's caching layer, lifting conversion 4%.";

export const GENERATED_SUMMARY =
  "Product-minded software engineer with six years of experience shipping reliable web platforms.";

const PARSED_CONTENT: ResumeContent = {
  personalInfo: { name: "Jordan Rivera", email: "jordan@example.com", headline: "Software Engineer" },
  summary: "Engineer who ships.",
  workExperience: [
    {
      id: "8d4b9a52-6a0e-4f3f-9f39-7c3c1d1e2a10",
      company: "Acme Corp",
      position: "Software Engineer",
      startDate: "2021-03",
      endDate: null,
      bullets: ["Built the billing service."],
    },
  ],
  education: [],
  skills: ["TypeScript", "Python"],
  projects: [],
};

function tailorFor(content: ResumeContent | undefined): TailorJDResponse {
  const work = content?.workExperience?.[0];
  const current = work?.bullets?.[0] ?? "";
  return {
    match_score: 68,
    missing_keywords: ["Kubernetes", "GraphQL", "Observability"],
    suggestions: work
      ? [
          {
            bullet_id: `${work.id}::0`,
            current,
            suggested: `${current.replace(/\.$/, "")} on Kubernetes, with GraphQL APIs and full observability.`,
            adds: ["Kubernetes", "GraphQL"],
          },
        ]
      : [],
    ai_usage: AI_USAGE,
  };
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

/** Answer every AI endpoint with a realistic fixture. Specs can override one with their own route. */
export async function mockAi(page: Page) {
  await page.route("**/api/ai/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace(/^\/api\/ai\//, "").replace(/\/$/, "");
    const body = (route.request().postDataJSON() ?? {}) as { content?: ResumeContent };
    switch (endpoint) {
      case "improve-bullet":
        return json(route, { suggestion: IMPROVED_BULLET, ai_usage: AI_USAGE } satisfies ImproveBulletResponse);
      case "generate-summary":
        return json(route, { summary: GENERATED_SUMMARY, ai_usage: AI_USAGE } satisfies GenerateSummaryResponse);
      case "tailor-jd":
        return json(route, tailorFor(body.content));
      case "ats-check":
        return json(route, {
          score: 82,
          issues: ["Two bullets start with the same verb."],
          recommendations: ["Add a measurable result to your most recent role."],
          ai_usage: AI_USAGE,
        } satisfies AtsCheckResponse);
      case "cover-letter":
        return json(route, {
          cover_letter: "Dear Hiring Manager,\n\nI am excited to apply.\n\nSincerely,\nJordan",
          ai_usage: AI_USAGE,
        } satisfies CoverLetterResponse);
      case "parse-resume":
        return json(route, { content: PARSED_CONTENT, ai_usage: AI_USAGE } satisfies ParseResumeResponse);
      default:
        // Unknown endpoint: fail loudly rather than let it through.
        return route.fulfill({ status: 500, body: `Unmocked AI endpoint: ${endpoint}` });
    }
  });
}
