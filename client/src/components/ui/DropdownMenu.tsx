/* eslint-disable react-refresh/only-export-components -- thin re-exports of Radix primitives */
import * as DM from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Non-modal: a menu isn't a dialog (WAI-ARIA menu button pattern). Radix's default modal
 * mode sets aria-hidden on the whole app while a menu is open, hiding still-focusable
 * content from screen readers (axe: aria-hidden-focus). Esc, Tab, and outside clicks still
 * close it, and focus still returns to the trigger. The catch: the press that dismisses
 * the menu also reaches whatever is under it; where that would act (ResumeCard's
 * stretched link), the caller ignores the click that follows the dismissal.
 */
export function DropdownMenu(props: ComponentPropsWithoutRef<typeof DM.Root>) {
  return <DM.Root modal={false} {...props} />;
}
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-dropdown min-w-[10rem] rounded-lg border border-border bg-surface p-1.5 shadow-heavy",
          "data-[state=open]:animate-fade-in-up",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive
          ? "text-destructive focus:bg-destructive/10"
          : "text-foreground focus:bg-surface-variant",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Separator>) {
  return <DM.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
