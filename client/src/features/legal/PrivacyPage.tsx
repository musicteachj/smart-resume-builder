/*
 * DRAFT FOR REVIEW: this is plain-language copy written from the app's actual data flows,
 * for James to review before launch. It is not legal advice. If a data flow changes (a new
 * AI feature, analytics, a new cookie, a new email provider), update this page and
 * LEGAL_LAST_UPDATED in lib/site.ts.
 */
import { CONTACT_EMAIL } from "@/lib/site";

import { LegalLayout, LegalLink, LegalList, LegalSection } from "./LegalLayout";

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={
        <p>
          ResumeIQ is a résumé builder run as a personal portfolio project. This page explains, in
          plain language, what we store, what leaves our servers, and how to delete it. The short
          version: the demo has no accounts, so we never ask for your name, email, or password. We
          send text to an AI provider only when you use an AI feature, and we don&apos;t run ads,
          analytics, or trackers or sell your data.
        </p>
      }
    >
      <LegalSection title="Please don't upload a real resume">
        <p>
          Please don&apos;t upload a real resume. Use the sample or made-up details. This is a
          public demo, and anything you enter is meant to be throwaway.
        </p>
      </LegalSection>

      <LegalSection title="What we store">
        <LegalList>
          <li>
            <strong className="font-semibold">Your demo:</strong> a random guest ID. It isn&apos;t
            tied to your name or email, because the demo doesn&apos;t ask for either.
          </li>
          <li>
            <strong className="font-semibold">Your résumés:</strong> everything you enter in the
            demo, including the title, template, font, section order, and any details you type into
            the résumé.
          </li>
          <li>
            <strong className="font-semibold">Version history:</strong> saved and automatic
            snapshots of your résumés, so you can look back and restore an earlier version.
          </li>
          <li>
            <strong className="font-semibold">Cover letters:</strong> the letters you save,
            including the job description you pasted to write them.
          </li>
          <li>
            <strong className="font-semibold">AI usage logs:</strong> for each AI request, which
            feature you used, how many characters went in and came out, whether it succeeded, and
            when. These logs never contain the text itself, and our AI error logs never include your
            text either.
          </li>
          <li>
            <strong className="font-semibold">AI spend records:</strong> the cost of each AI
            request and the name of the model, so the daily AI budget can be enforced. These records
            contain no text and are kept for up to 35 days.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="AI features and Anthropic">
        <p>
          AI features are powered by Claude, through Anthropic&apos;s API. Text is sent to Anthropic
          only when you use one of these features, and only the text that feature needs:
        </p>
        <LegalList>
          <li>
            <strong className="font-semibold">Improve a bullet:</strong> the bullet and the job title
            it belongs to.
          </li>
          <li>
            <strong className="font-semibold">Generate a summary:</strong> your résumé content.
          </li>
          <li>
            <strong className="font-semibold">Tailor to a job:</strong> your résumé content and the
            job description you paste.
          </li>
          <li>
            <strong className="font-semibold">Import a résumé:</strong> the text extracted from your
            file. Files are converted to text in your browser; the file itself is never uploaded.
          </li>
          <li>
            <strong className="font-semibold">Write a cover letter:</strong> your résumé content and
            the job description.
          </li>
          <li>
            <strong className="font-semibold">ATS health check:</strong> your résumé content.
          </li>
        </LegalList>
        <p>
          Anthropic processes this text under its commercial API terms. If you never use an AI
          feature, none of your text is sent to Anthropic.
        </p>
      </LegalSection>

      <LegalSection title="Cloudflare">
        <p>
          When you start a demo, a Cloudflare Turnstile check confirms you aren&apos;t a bot.
          Cloudflare sees your IP address and some browser signals at that moment. The check runs
          only when you start a demo.
        </p>
      </LegalSection>

      <LegalSection title="Amazon Web Services">
        <p>
          The app runs on Amazon Web Services (AWS). AWS hosts the servers and the database, holds
          the backups, and stores the server logs.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and browser storage">
        <LegalList>
          <li>
            One cookie, <code className="text-sm">refresh_token</code>, keeps your demo going. It
            is httpOnly (scripts on the page can&apos;t read it), is sent only to our
            authentication endpoints (<code className="text-sm">/api/auth</code>), and lasts up to 24 hours.
          </li>
          <li>
            Your short-lived access token is kept only in the page&apos;s memory, never saved to
            disk.
          </li>
          <li>
            Your light or dark mode choice is saved in your browser&apos;s local storage as{" "}
            <code className="text-sm">resumeiq-theme</code>.
          </li>
        </LegalList>
        <p>That&apos;s all. There are no advertising, analytics, or tracking cookies.</p>
      </LegalSection>

      <LegalSection title="Google Fonts">
        <p>
          The app loads its fonts from Google Fonts, so your browser contacts Google&apos;s servers
          when you open it. Like any web request, that shows Google your IP address.
        </p>
      </LegalSection>

      <LegalSection title="Server logs">
        <p>
          Like most websites, the server keeps technical logs (for example, the time of a request,
          the address requested, your IP address, and your browser type) to keep the service
          running and secure. These logs don&apos;t contain your résumé text.
          Short-lived rate-limit counters for starting demos also use your IP address and expire
          within a day.
        </p>
      </LegalSection>

      <LegalSection title="What we don't do">
        <LegalList>
          <li>No analytics, ads, or third-party trackers.</li>
          <li>We don&apos;t sell or rent your data, or share it for advertising.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Keeping and deleting your data">
        <p>
          Your demo and everything in it is removed from the app after 24 hours. Daily server
          backups keep copies for up to 7 days. Server logs (including IP addresses) are kept for
          14 days.
        </p>
        <p>
          Ending your demo (Sign out and end demo) deletes it from the app right away. Deleting a
          résumé also deletes its version history and its cover letters.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about your data or this policy? Email{" "}
          <LegalLink to={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
