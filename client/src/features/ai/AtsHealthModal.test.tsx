import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { EditorValues } from "@/features/editor/editorSchema";

const atsResult = {
  score: 78,
  issues: ["Summary is generic.", "Few quantified results."],
  recommendations: ["Add metrics to bullets.", "Sharpen the summary."],
  ai_usage: { calls_today: 1, daily_limit: 10 },
};

const { mutate } = vi.hoisted(() => ({
  mutate: vi.fn((_vars, opts?: { onSuccess?: (r: unknown) => void }) => opts?.onSuccess?.(atsResult)),
}));
vi.mock("@/api/generated/ai/ai", () => ({
  useAtsHealthCheck: () => ({ mutate, data: atsResult, isPending: false, isError: false, error: null }),
}));

import { AtsHealthModal } from "./AtsHealthModal";

function Harness() {
  const methods = useForm<EditorValues>({
    defaultValues: {
      title: "R",
      content: { personalInfo: { name: "Maya" }, summary: "", workExperience: [], education: [], skills: [], projects: [] },
    },
  });
  return (
    <FormProvider {...methods}>
      <AtsHealthModal onClose={() => {}} />
    </FormProvider>
  );
}

describe("AtsHealthModal", () => {
  it("runs on open and shows the issues and recommendations", () => {
    render(<Harness />);
    expect(mutate).toHaveBeenCalled();
    expect(screen.getByText("Summary is generic.")).toBeInTheDocument();
    expect(screen.getByText("Add metrics to bullets.")).toBeInTheDocument();
  });
});
