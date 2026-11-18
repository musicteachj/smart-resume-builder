import { useRef } from "react";

import { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus handlers for a Radix `Dialog.Content` opened without a `Dialog.Trigger` (all of
 * ours: they're controlled by `open`). Radix returns focus to its Trigger on close, so with
 * no Trigger focus fell to <body> and keyboard users lost their place. This remembers what
 * had focus when the dialog opened (for a menu item, the menu's button) and puts focus
 * back there. If that element is gone (say, the item that was just deleted), it falls back
 * to the dialog the opener sat in (for a confirm dialog opened from another dialog), then
 * to the page's main landmark.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const enclosingDialog = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus: () => {
      // Runs before Radix moves focus into the dialog, so this is still the opener.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) {
        opener.current = null;
        enclosingDialog.current = null;
        return;
      }
      // Opened from a menu item: the item disappears with its menu, so return to the
      // button that opened the menu instead.
      const menu = active.closest<HTMLElement>('[role="menu"]');
      const trigger = menu?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) : null;
      opener.current = trigger ?? active;
      enclosingDialog.current = opener.current.closest<HTMLElement>('[role="dialog"]');
    },
    onCloseAutoFocus: (event: Event) => {
      const dialog = enclosingDialog.current?.isConnected ? enclosingDialog.current : null;
      const target = opener.current?.isConnected
        ? opener.current
        : dialog
          ? (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog)
          : document.getElementById(MAIN_CONTENT_ID);
      opener.current = null;
      enclosingDialog.current = null;
      if (!target) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
    },
  };
}
