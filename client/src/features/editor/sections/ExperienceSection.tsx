import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SortableList } from "@/components/ui/SortableList";

import { BulletEditor } from "../components/BulletEditor";
import { entryLabel } from "../entryLabel";
import { newWorkItem, type EditorValues } from "../editorSchema";

export function ExperienceSection() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: "content.workExperience" });
  // Names for each job's controls ("Remove Acme Corp", "Bullet 1 from Acme Corp").
  // Watch only each job's company and title (not the whole array), so typing in a bullet
  // doesn't re-render the section.
  const names = useWatch({
    control,
    name: fields.flatMap((_, i) => [
      `content.workExperience.${i}.company` as const,
      `content.workExperience.${i}.position` as const,
    ]),
  }) as (string | undefined)[];
  const jobLabel = (i: number) => entryLabel([names[i * 2], names[i * 2 + 1]], `job ${i + 1}`);

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No experience added yet.</p>
      )}
      <SortableList
        items={fields}
        getId={(f) => f.id}
        onReorder={move}
        itemLabel={(_f, i) => jobLabel(i)}
      >
        {(_f, handle, i) => {
          const e = errors.content?.workExperience?.[i];
          return (
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {handle}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Position {i + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${jobLabel(i)}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Company" htmlFor={`w-${i}-company`} error={e?.company?.message}>
                  <Input id={`w-${i}-company`} {...register(`content.workExperience.${i}.company`)} />
                </Field>
                <Field label="Position" htmlFor={`w-${i}-position`} error={e?.position?.message}>
                  <Input id={`w-${i}-position`} {...register(`content.workExperience.${i}.position`)} />
                </Field>
                <Field label="Location" htmlFor={`w-${i}-location`} error={e?.location?.message}>
                  <Input id={`w-${i}-location`} {...register(`content.workExperience.${i}.location`)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" htmlFor={`w-${i}-start`} error={e?.startDate?.message}>
                    <Input
                      id={`w-${i}-start`}
                      placeholder="2022-01"
                      {...register(`content.workExperience.${i}.startDate`)}
                    />
                  </Field>
                  <Field label="End" htmlFor={`w-${i}-end`} error={e?.endDate?.message} hint="blank = current">
                    <Input
                      id={`w-${i}-end`}
                      placeholder="2024-06"
                      {...register(`content.workExperience.${i}.endDate`)}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-3">
                <span className="mb-1.5 block text-sm font-semibold text-foreground">Bullets</span>
                <Controller
                  control={control}
                  name={`content.workExperience.${i}.bullets`}
                  render={({ field }) => (
                    <BulletEditor value={field.value} onChange={field.onChange} context={jobLabel(i)} />
                  )}
                />
              </div>
            </div>
          );
        }}
      </SortableList>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => append(newWorkItem())}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add experience
      </Button>
    </div>
  );
}
