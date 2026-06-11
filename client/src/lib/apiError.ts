import { AxiosError } from "axios";

/** Flatten a DRF error body ({field: [msg]}) into {field: msg}. */
export function fieldErrors(err: unknown): Record<string, string> {
  const data = (err as AxiosError<Record<string, string[] | string>>)?.response?.data;
  const out: Record<string, string> = {};
  if (data && typeof data === "object") {
    for (const [key, val] of Object.entries(data)) {
      out[key] = Array.isArray(val) ? String(val[0]) : String(val);
    }
  }
  return out;
}
