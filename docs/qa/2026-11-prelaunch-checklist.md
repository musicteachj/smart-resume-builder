# Pre-launch QA checklist (manual)

Run before the first production deploy. The automated suite (`npm run test:e2e`: Playwright on Chromium and
WebKit, axe in light and dark, a keyboard pass, a tablet pass) covers most of the same ground; this list is for
what automation can't see: the real Safari app, a real screen reader, system settings, and native dialogs.

Use a throwaway account (`you+qa@...`) and delete it at the end (that's the last step). Run the app with
`npm run dev`, or better, the production image (`docker compose --profile prod up app`).

## 1. Real Safari on macOS (1280 wide, then an iPad-sized 820 × 1180 window)

Pass = the step works with no console errors, nothing overlaps or scrolls sideways, and the result looks like
Chrome's.

- [ ] **Register** a new account: validation errors appear under each field; success lands on the dashboard.
- [ ] **Import** a real résumé PDF and a DOCX through the file picker (the native picker is the part automation
      skips). The review preview shows your content; "Open in editor" creates it.
- [ ] **Edit**: type in personal info and a work entry; the preview updates and "Saved" appears. Reload: edits stay.
- [ ] **Reorder with the mouse or trackpad**: drag a section and a bullet by their grip handles. The item moves
      smoothly and keeps its size (automation only drives the keyboard path).
- [ ] **Templates**: open the gallery; all six thumbnails render (Safari once blanked them); pick one and a font.
- [ ] **Export PDF**: the print dialog opens; "Save as PDF" gives a one-page Letter résumé with 0.5in margins,
      no app chrome, and clickable LinkedIn/GitHub/Website links. (Automation can't drive the print dialog.)
- [ ] **Export DOCX and TXT**: both download with the résumé title as the file name and open correctly.
- [ ] **Tailor to a job description** (real AI): paste a posting, analyze, pick a rewrite and a keyword, apply.
- [ ] **Cover letter**: generate, edit, save, reopen, download.
- [ ] **History**: save a named version, change something, restore it, then undo the restore.
- [ ] **Reset password**: request a link (dev prints it in the server console), open it in Safari, set a new
      password, sign in with it. The token disappears from the address bar.
- [ ] **Delete account** from `/account`: a wrong password shows "Incorrect password."; the right one returns to
      the home page, and signing in again fails.

## 2. VoiceOver (Safari, Cmd+F5)

Pass = every control is announced with a sensible name and role, headings and landmarks make sense in the rotor
(Ctrl+Option+U), and nothing is read twice or skipped.

- [ ] **Landing**: "Skip to main content" is the first item; rotor shows one `h1`, a "Legal" navigation, a main.
- [ ] **Login**: each field reads its label; a failed sign-in announces the error; "Show password" toggles.
- [ ] **Dashboard**: each résumé reads as an article with its title as a link and an "Options for <title>" button;
      the delete dialog reads its title and description, and closing it returns you to the options button.
- [ ] **Editor**: the rotor lists "Edit resume: <title>" and the section headings (Personal info, Summary, ...);
      dragging a section with Space and arrows announces "Picked up Summary, position 1 of 5" and where it lands;
      the AI modals announce their titles; "Saved" is announced politely after edits.

## 3. Zoom to 200% (Cmd+Plus in Safari and Chrome)

- [ ] Landing, login, dashboard, account, and editor: no text is cut off or overlapping, nothing needs sideways
      scrolling except the résumé preview itself, and every dialog can be scrolled to its buttons.

## 4. Keyboard only (no mouse)

Safari skips links on Tab by default: turn on Safari > Settings > Advanced > "Press Tab to highlight each item",
or use Option+Tab.

- [ ] Every stop shows a visible focus ring, in an order that matches the screen, on every page.
- [ ] The full flow works by keyboard: register, create a résumé, edit, reorder (Space, arrows, Space), open each
      AI tool and the template gallery, export, open History, sign out.
- [ ] In every dialog, Tab stays inside, Esc closes it, and focus returns to the button that opened it.

## 5. Reduced motion (System Settings > Accessibility > Display > Reduce motion)

- [ ] Menus, dialogs, card hover lift, and drag-to-reorder no longer animate (or change instantly).

## 6. Dark mode (header toggle, and with macOS set to Dark on a first visit)

- [ ] Every page and dialog reads clearly; the score meter's three bands (Needs work, Good, Strong) are legible.
- [ ] The résumé preview, gallery thumbnails, and exported PDF stay light (they're the document, not the app).
- [ ] A first visit with macOS in Dark (clear site data first) opens in dark.

## Known findings not fixed in code

- **Print-to-PDF, the native file picker, and mouse dragging** can't be driven by automation in WebKit; they're
  covered by section 1 above.
- **Dates are typed as text** (for example 2022-01), not `type="month"` inputs, so desktop Safari's missing month
  picker doesn't affect the app.
