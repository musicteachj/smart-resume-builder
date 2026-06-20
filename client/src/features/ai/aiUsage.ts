import type { AIUsage } from "@/api/generated/model";
import { useAuthStore } from "@/stores/auth";

/** Push the latest AI-usage snapshot from a response into the auth store so the
 * header pill stays current after AI calls. */
export function applyAiUsage(usage?: AIUsage): void {
  if (!usage) return;
  const { user, setUser } = useAuthStore.getState();
  if (user) setUser({ ...user, ai_usage: usage });
}
