/*
 * DRAFT FOR REVIEW: plain-language terms for James to review before launch. This is not
 * legal advice. If the terms change, update LEGAL_LAST_UPDATED in lib/site.ts.
 */
import { CONTACT_EMAIL } from "@/lib/site";

import { LegalLayout, LegalLink, LegalList, LegalSection } from "./LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      intro={
        <p>
          These terms cover your use of ResumeIQ. By creating an account or using the app, you agree
          to them. Please also read the <LegalLink to="/privacy">Privacy Policy</LegalLink>, which
          explains what we store and how to delete it.
        </p>
      }
    >
      <LegalSection title="A personal project">
        <p>
          ResumeIQ is a personal portfolio project, not a commercial service. It&apos;s free to use
          and is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any
          kind. We can&apos;t promise it will always be available, error-free, or that your data
          will never be lost, so keep your own copy of anything important (for example, by
          exporting your résumé as a PDF or Word file).
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You own what you write. You give us permission to store it and process it only as needed
          to run the app, including sending it to our AI provider when you use an AI feature. You
          are responsible for what you put in your résumés and cover letters, and for having the
          right to use it.
        </p>
      </LegalSection>

      <LegalSection title="AI output can be wrong">
        <p>
          AI suggestions, summaries, cover letters, scores, and imported résumés are generated
          automatically and can be inaccurate, incomplete, or invented. Review and edit everything
          before you send it to anyone. You are responsible for making sure your résumé and cover
          letters are truthful. A match or ATS score is an estimate, not a guarantee of how any
          employer or hiring system will rate you.
        </p>
      </LegalSection>

      <LegalSection title="AI usage limits">
        <p>
          To keep costs under control, each account has daily and monthly limits on AI requests.
          The app shows how many you&apos;ve used. Limits may change.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Please don&apos;t:</p>
        <LegalList>
          <li>use ResumeIQ for anything unlawful, or to store or create unlawful content;</li>
          <li>abuse the service, overload it, or access it with bots or automated scraping;</li>
          <li>try to get around the AI usage limits, for example with multiple accounts;</li>
          <li>try to access other people&apos;s accounts or data, or interfere with security.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Suspension and deletion">
        <p>
          We may suspend or remove accounts that break these terms or abuse the service. You can
          delete your account at any time from the <LegalLink to="/account">Account page</LegalLink>
          , which permanently deletes your data.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          To the extent the law allows, we aren&apos;t liable for any loss or damage that comes from
          using ResumeIQ, including lost data or decisions made based on AI output.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update these terms. When we do, we&apos;ll change the &quot;Last updated&quot;
          date above. Continuing to use ResumeIQ after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions? Email <LegalLink to={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
