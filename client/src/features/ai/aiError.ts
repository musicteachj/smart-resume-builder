import { AxiosError } from "axios";

import type { AIUsage } from "@/api/generated/model";

import { applyAiUsage } from "./aiUsage";

/** Turn an AI endpoint error into a friendly message; also syncs usage from a
 * 429 body so the pill reflects the (exhausted) quota. */
export function aiErrorMessage(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string; ai_usage?: AIUsage }>;
  const status = ax?.response?.status;
  const data = ax?.response?.data;
  applyAiUsage(data?.ai_usage);

  if (status === 429) {
    return data?.detail ?? "You've reached your AI usage limit. Try again later.";
  }
  if (status === 502) {
    return data?.detail ?? "The AI service is temporarily unavailable. Please try again.";
  }
  return data?.detail ?? "Something went wrong generating that. Please try again.";
}
