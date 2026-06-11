import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { useRegister } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { fieldErrors } from "@/lib/apiError";
import { useAuthStore } from "@/stores/auth";

import { AuthShell } from "./AuthShell";
import { registerSchema, type RegisterValues } from "./schemas";

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { mutateAsync, isPending } = useRegister();
  const [showPassword, setShowPassword] = useState(false);
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
      setSession({ user: res.user, access: res.access, refresh: res.refresh });
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
      subtitle="Start building a recruiter-ready resume — free."
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a password"
                className="pr-10"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Button type="submit" className="w-full" loading={isPending}>
            Create account
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
