import editor from "@/features/marketing/screenshots/editor.jpg";
import tailor from "@/features/marketing/screenshots/tailor.jpg";
import templates from "@/features/marketing/screenshots/templates.jpg";

/** Screenshots for the demo landing page, captured by `npm run screenshots` (client/e2e/screenshots)
 * from the fictional sample resume. While this is empty, `<Screenshots />` renders nothing. */
export const SCREENSHOTS: { src: string; alt: string; caption: string }[] = [
  {
    src: editor,
    alt: "The editor: the form on the left and the live resume preview on the right",
    caption: "Edit on the left and watch the resume update on the right.",
  },
  {
    src: templates,
    alt: "Choosing among six resume templates",
    caption: "Six ATS-safe templates, each previewed with your own content.",
  },
  {
    src: tailor,
    alt: "Tailoring a resume to a job description, with an ATS match score",
    caption: "Tailor to a job description and see an ATS match score. Illustrative example.",
  },
];
