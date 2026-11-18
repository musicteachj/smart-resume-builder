import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "./Field";
import { Input } from "./Input";

describe("Field", () => {
  it("describes the control with its hint", () => {
    render(
      <Field label="Password" htmlFor="pw" hint="At least 8 characters.">
        <Input id="pw" />
      </Field>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-describedby", "pw-hint");
    expect(input).toHaveAccessibleDescription("At least 8 characters.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and describes it with the error", () => {
    render(
      <Field label="Email" htmlFor="email" error="Enter a valid email">
        <Input id="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email");
  });

  it("keeps the control's own aria-describedby and adds the field's message after it", () => {
    render(
      <>
        <p id="pw-rules">Avoid your name.</p>
        <Field label="Password" htmlFor="pw" hint="At least 8 characters.">
          <Input id="pw" aria-describedby="pw-rules" />
        </Field>
      </>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-describedby", "pw-rules pw-hint");
    expect(input).toHaveAccessibleDescription("Avoid your name. At least 8 characters.");
  });
});
