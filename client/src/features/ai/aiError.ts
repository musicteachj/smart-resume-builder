import { AxiosError } from "axios";

import type { AIUsage } from "@/api/generated/model";

import { applyAiUsage } from "./aiUsage";

const FALLBACK = "Something went wrong with the AI. You can keep editing, switching templates, and exporting.";

/** Turn an AI endpoint error into a friendly message; also syncs usage from a
 * 429 body so the pill reflects the (exhausted) quota. */
export function aiErrorMessage(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string; ai_usage?: AIUsage }>;
  const status = ax?.response?.status;
  const data = ax?.response?.data;
  applyAiUsage(data?.ai_usage);

  // 504: the load balancer gave up; ECONNABORTED/ETIMEDOUT: axios's own timeout.
  if (status === 504 || ax?.code === "ECONNABORTED" || ax?.code === "ETIMEDOUT") {
    return "That took too long. You can keep editing, switching templates, and exporting, and try the AI again later.";
  }
  // Server refusals (429, 502, 503) carry friendly copy with a `code` that points at the free path.
  return data?.detail ?? FALLBACK;
}
