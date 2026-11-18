import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useConfirmPasswordReset } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { fieldErrors } from "@/lib/apiError";
import { useAuthStore } from "@/stores/auth";

import { AuthShell } from "./AuthShell";
import { resetPasswordSchema, type ResetPasswordValues } from "./schemas";

const INVALID_LINK = "This reset link is invalid or has expired.";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  // The emailed link carries uid + token in the fragment (#uid=...&token=...), which the
  // browser never sends to the server, so the token stays out of access logs. Read them
  // once, keep them in state, and drop them from the address bar and history entry.
  const { hash, pathname, search } = useLocation();
  const [{ uid, token }] = useState(() => {
    const params = new URLSearchParams(hash.slice(1));
    return { uid: params.get("uid") ?? "", token: params.get("token") ?? "" };
  });
  useEffect(() => {
    if (hash) window.history.replaceState(window.history.state, "", pathname + search);
    // Only on mount: the link is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const logout = useAuthStore((s) => s.logout);
  const { mutateAsync, isPending } = useConfirmPasswordReset();
  const [linkError, setLinkError] = useState<string | null>(uid && token ? null : INVALID_LINK);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await mutateAsync({ data: { uid, token, new_password: password } });
      // The server revoked every refresh token; sign this tab out too.
      logout();
      navigate("/login", {
        replace: true,
        state: { notice: "Your password was reset. Sign in with your new password." },
      });
    } catch (err) {
      const fe = fieldErrors(err);
      // Only a 400 `detail` means a bad link; a 429 also has a `detail` (throttled).
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (fe.new_password) setError("password", { message: fe.new_password }, { shouldFocus: true });
      else if (status === 400 && fe.detail) setLinkError(fe.detail);
      else if (status === 429) setFormError("Too many attempts. Please wait a while and try again.");
      else setFormError("We couldn't reset your password. Please try again.");
    }
  });

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Then sign in with it. Other devices are signed out within 15 minutes."
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
        {linkError ? (
          <div role="alert" className="space-y-4 text-sm">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{linkError}</p>
            <p className="leading-relaxed text-muted-foreground">
              Reset links work once and expire after 1 hour.{" "}
              <Link to="/forgot-password" className="font-semibold text-accent">
                Request a new link
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            )}
            <Field
              label="New password"
              htmlFor="password"
              error={errors.password?.message}
              hint="At least 8 characters. Avoid your name or email."
            >
              <PasswordInput
                id="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
              <PasswordInput
                id="confirmPassword"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register("confirmPassword")}
              />
            </Field>
            <Button type="submit" className="w-full" loading={isPending}>
              Reset password
            </Button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
