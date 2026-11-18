import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { useRequestPasswordReset } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { fieldErrors } from "@/lib/apiError";

import { AuthShell } from "./AuthShell";
import { forgotPasswordSchema, type ForgotPasswordValues } from "./schemas";

export function ForgotPasswordPage() {
  const { mutateAsync, isPending } = useRequestPasswordReset();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutateAsync({ data: values });
      setSent(true);
    } catch (err) {
      const fe = fieldErrors(err);
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (fe.email) setError("email", { message: fe.email }, { shouldFocus: true });
      else if (status === 429) setFormError("Too many reset requests. Try again in an hour.");
      else setFormError("We couldn't send the reset link. Please try again in a few minutes.");
    }
  });

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <Card className="p-6">
        {sent ? (
          <div role="status" className="flex gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Check your email</p>
              <p className="leading-relaxed text-muted-foreground">
                If an account exists for that email, we sent a reset link. It expires in 1 hour.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            )}
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
            </Field>
            <Button type="submit" className="w-full" loading={isPending}>
              Send reset link
            </Button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
