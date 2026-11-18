import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useLogin } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuthStore } from "@/stores/auth";

import { AuthShell } from "./AuthShell";
import { loginSchema, type LoginValues } from "./schemas";

export function LoginPage() {
  const navigate = useNavigate();
  // A one-time message from the page that sent us here (e.g. after a password reset).
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const setSession = useAuthStore((s) => s.setSession);
  const { mutateAsync, isPending } = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await mutateAsync({ data: values });
      setSession({ user: res.user, access: res.access });
      navigate("/dashboard");
    } catch {
      setFormError("Invalid email or password.");
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep building your resume."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-semibold text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {notice && !formError && (
            <p role="status" className="rounded-md bg-surface-variant px-3 py-2 text-sm text-foreground">
              {notice}
            </p>
          )}
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
              {...register("email")}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            action={
              <Link to="/forgot-password" className="text-sm font-semibold text-accent">
                Forgot?
              </Link>
            }
          >
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Your password"
              {...register("password")}
            />
          </Field>
          <Button type="submit" className="w-full" loading={isPending}>
            Sign in
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
