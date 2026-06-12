import { useFormContext } from "react-hook-form";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

import type { EditorValues } from "../editorSchema";

export function PersonalInfoSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<EditorValues>();
  const e = errors.content?.personalInfo;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="pi-name" error={e?.name?.message}>
        <Input id="pi-name" placeholder="Maya Chen" {...register("content.personalInfo.name")} />
      </Field>
      <Field label="Professional title" htmlFor="pi-headline" error={e?.headline?.message}>
        <Input
          id="pi-headline"
          placeholder="Senior Product Designer"
          {...register("content.personalInfo.headline")}
        />
      </Field>
      <Field label="Email" htmlFor="pi-email" error={e?.email?.message}>
        <Input
          id="pi-email"
          type="email"
          placeholder="you@email.com"
          {...register("content.personalInfo.email")}
        />
      </Field>
      <Field label="Phone" htmlFor="pi-phone" error={e?.phone?.message}>
        <Input id="pi-phone" placeholder="(415) 555-0148" {...register("content.personalInfo.phone")} />
      </Field>
      <Field label="Location" htmlFor="pi-location" error={e?.location?.message}>
        <Input
          id="pi-location"
          placeholder="San Francisco, CA"
          {...register("content.personalInfo.location")}
        />
      </Field>
      <Field label="LinkedIn" htmlFor="pi-linkedin" error={e?.linkedin?.message}>
        <Input
          id="pi-linkedin"
          placeholder="https://linkedin.com/in/…"
          {...register("content.personalInfo.linkedin")}
        />
      </Field>
      <Field label="GitHub" htmlFor="pi-github" error={e?.github?.message}>
        <Input
          id="pi-github"
          placeholder="https://github.com/…"
          {...register("content.personalInfo.github")}
        />
      </Field>
      <Field label="Website" htmlFor="pi-website" error={e?.website?.message}>
        <Input id="pi-website" placeholder="https://…" {...register("content.personalInfo.website")} />
      </Field>
    </div>
  );
}
