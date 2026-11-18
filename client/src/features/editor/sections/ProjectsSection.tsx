import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SortableList } from "@/components/ui/SortableList";
import { Textarea } from "@/components/ui/Textarea";

import { TagInput } from "../components/TagInput";
import { newProjectItem, type EditorValues } from "../editorSchema";
import { entryLabel } from "../entryLabel";

export function ProjectsSection() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: "content.projects" });
  // Watch only each project's name (not the whole array).
  const names = useWatch({
    control,
    name: fields.map((_, i) => `content.projects.${i}.name` as const),
  }) as (string | undefined)[];
  const projectLabel = (i: number) => entryLabel([names[i]], `project ${i + 1}`);

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No projects added yet.</p>
      )}
      <SortableList
        items={fields}
        getId={(f) => f.id}
        onReorder={move}
        itemLabel={(_f, i) => projectLabel(i)}
      >
        {(_f, handle, i) => {
          const e = errors.content?.projects?.[i];
          return (
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {handle}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project {i + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${projectLabel(i)}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="space-y-3">
                <Field label="Name" htmlFor={`p-${i}-name`} error={e?.name?.message}>
                  <Input id={`p-${i}-name`} {...register(`content.projects.${i}.name`)} />
                </Field>
                <Field label="Description" htmlFor={`p-${i}-desc`} error={e?.description?.message}>
                  <Textarea id={`p-${i}-desc`} rows={2} {...register(`content.projects.${i}.description`)} />
                </Field>
                <Field label="URL" htmlFor={`p-${i}-url`} error={e?.url?.message}>
                  <Input id={`p-${i}-url`} placeholder="https://…" {...register(`content.projects.${i}.url`)} />
                </Field>
                <div>
                  <span className="mb-1.5 block text-sm font-semibold text-foreground">Technologies</span>
                  <Controller
                    control={control}
                    name={`content.projects.${i}.technologies`}
                    render={({ field }) => (
                      <TagInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Add a technology and press Enter"
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          );
        }}
      </SortableList>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => append(newProjectItem())}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add project
      </Button>
    </div>
  );
}
