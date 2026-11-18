import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { useRegister } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { fieldErrors } from "@/lib/apiError";
import { useAuthStore } from "@/stores/auth";

import { AuthShell } from "./AuthShell";
import { registerSchema, type RegisterValues } from "./schemas";

// New tab, so reading the Terms doesn't throw away a half-filled form.
const consentLinkClass =
  "rounded-sm text-foreground underline underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { mutateAsync, isPending } = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await mutateAsync({ data: values });
      setSession({ user: res.user, access: res.access });
      navigate("/dashboard");
    } catch (err) {
      const fe = fieldErrors(err);
      if (fe.email) setError("email", { message: fe.email });
      else if (fe.password) setError("password", { message: fe.password });
      else setFormError("Could not create your account. Please try again.");
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start building a recruiter-ready resume for free."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}
          <Field label="Full name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" placeholder="Maya Chen" {...register("name")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              {...register("email")}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint="At least 8 characters."
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="Create a password"
              {...register("password")}
            />
          </Field>
          <Button type="submit" className="w-full" loading={isPending}>
            Create account
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            By creating an account you agree to the{" "}
            <Link to="/terms" target="_blank" rel="noopener" className={consentLinkClass}>
              Terms<span className="sr-only"> (opens in a new tab)</span>
            </Link>{" "}
            and acknowledge the{" "}
            <Link to="/privacy" target="_blank" rel="noopener" className={consentLinkClass}>
              Privacy Policy<span className="sr-only"> (opens in a new tab)</span>
            </Link>
            .
          </p>
        </form>
      </Card>
    </AuthShell>
  );
}
