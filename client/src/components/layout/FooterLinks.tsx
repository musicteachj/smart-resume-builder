import { Link } from "react-router-dom";

import { CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

const linkClass =
  "rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Privacy, Terms, and Contact: the public footer links (landing, auth, and legal pages). */
export function FooterLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn("flex gap-5", className)}>
      <Link to="/privacy" className={linkClass}>
        Privacy
      </Link>
      <Link to="/terms" className={linkClass}>
        Terms
      </Link>
      <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
        Contact
      </a>
    </nav>
  );
}
