import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { Spinner } from "./Spinner";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Dark mode lightens on hover instead: fading the light accent toward the dark page
        // would drop its dark label below 4.5:1.
        primary:
          "bg-accent text-accent-foreground hover:bg-accent/90 hover:shadow-cta dark:hover:bg-accent dark:hover:brightness-110",
        secondary: "border border-border bg-surface text-foreground hover:bg-surface-variant",
        ghost: "text-foreground hover:bg-surface-variant",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> &
  (
    | { asChild?: false; loading?: boolean }
    | {
        /** Render the single child (e.g. a router `Link`) with button styles instead of a
         * `<button>`, so a link that looks like a button is still one interactive element.
         * A link can't be disabled or show a spinner, so those props aren't allowed here. */
        asChild: true;
        loading?: never;
        disabled?: never;
      }
  );

export function Button({
  className,
  variant,
  size,
  loading = false,
  asChild = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
