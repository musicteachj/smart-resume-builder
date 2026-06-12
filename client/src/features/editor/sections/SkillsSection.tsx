import { Controller, useFormContext } from "react-hook-form";

import { TagInput } from "../components/TagInput";
import type { EditorValues } from "../editorSchema";

export function SkillsSection() {
  const { control } = useFormContext<EditorValues>();
  return (
    <Controller
      control={control}
      name="content.skills"
      render={({ field }) => (
        <TagInput
          value={field.value}
          onChange={field.onChange}
          placeholder="Add a skill and press Enter"
        />
      )}
    />
  );
}
