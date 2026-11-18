import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { useDeleteAccount } from "@/api/generated/auth/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { deleteAccountSchema, type DeleteAccountValues } from "@/features/auth/schemas";
import { fieldErrors } from "@/lib/apiError";
import { useAuthStore } from "@/stores/auth";

/** Password-confirmed, permanent account deletion. On success the session and the query
 * cache are cleared (the server already cleared the refresh cookie) and we go home. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { mutateAsync, isPending } = useDeleteAccount();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<DeleteAccountValues>({ resolver: zodResolver(deleteAccountSchema), mode: "onTouched" });

  const handleOpenChange = (next: boolean) => {
    if (isPending) return; // don't close mid-request
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutateAsync({ data: values });
    } catch (err) {
      const fe = fieldErrors(err);
      if (fe.password) setError("password", { message: fe.password }, { shouldFocus: true });
      else setFormError("We couldn't delete your account. Please try again.");
      return;
    }
    logout({ signedOut: true });
    navigate("/", { replace: true });
  });

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Delete your account?"
      description="This permanently deletes your account and all of your résumés, saved versions, and cover letters. It can't be undone."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <Field
          label="Password"
          htmlFor="delete-account-password"
          error={errors.password?.message}
          hint="Enter your password to confirm."
        >
          <PasswordInput
            id="delete-account-password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" variant="destructive" size="sm" loading={isPending}>
            Delete account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
