import { useGetDemoStatus } from "@/api/generated/demo/demo";
import type { DemoStatus } from "@/api/generated/model";

/**
 * Whether this deployment is the public demo (from `GET /api/demo/status`, never a Vite
 * variable). Fails closed: if the status can't be fetched, `demoMode` is true, so account
 * screens stay hidden; the start button then shows as unavailable.
 */
export function useDemoStatus(): { status: DemoStatus | undefined; isLoading: boolean; demoMode: boolean } {
  const query = useGetDemoStatus({ query: { staleTime: 60_000 } });
  return {
    status: query.data,
    isLoading: query.isLoading,
    demoMode: query.isError || query.data?.demo_mode === true,
  };
}
