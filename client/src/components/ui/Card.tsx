import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** `ref` passes through (a plain prop in React 19). */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface shadow-light", className)}
      {...props}
    />
  );
}
