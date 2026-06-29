import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SortableList } from "@/components/ui/SortableList";

import { newEducationItem, type EditorValues } from "../editorSchema";

export function EducationSection() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: "content.education" });

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No education added yet.</p>
      )}
      <SortableList items={fields} getId={(f) => f.id} onReorder={move}>
        {(_f, handle, i) => {
          const e = errors.content?.education?.[i];
          return (
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {handle}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Education {i + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove education"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="School" htmlFor={`e-${i}-school`} error={e?.school?.message}>
                  <Input id={`e-${i}-school`} {...register(`content.education.${i}.school`)} />
                </Field>
                <Field label="Degree" htmlFor={`e-${i}-degree`} error={e?.degree?.message}>
                  <Input id={`e-${i}-degree`} {...register(`content.education.${i}.degree`)} />
                </Field>
                <Field label="Field of study" htmlFor={`e-${i}-field`} error={e?.field?.message}>
                  <Input id={`e-${i}-field`} {...register(`content.education.${i}.field`)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Graduated" htmlFor={`e-${i}-grad`} error={e?.graduationDate?.message}>
                    <Input
                      id={`e-${i}-grad`}
                      placeholder="2017-05"
                      {...register(`content.education.${i}.graduationDate`)}
                    />
                  </Field>
                  <Field label="GPA" htmlFor={`e-${i}-gpa`} error={e?.gpa?.message}>
                    <Input id={`e-${i}-gpa`} placeholder="3.8" {...register(`content.education.${i}.gpa`)} />
                  </Field>
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
        onClick={() => append(newEducationItem())}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" /> Add education
      </Button>
    </div>
  );
}
