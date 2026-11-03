# Lawcovery — Legal collections portal

Lawcovery is an independent React + Vite project. This project is not deployed and has no dependency on ChatGPT Sites hosting.

## Run on your computer

Install Node.js 22 LTS or newer, then open this folder in Terminal:

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173). Save code changes to see them immediately. Stop the server with Ctrl+C.

## Connect Supabase (required for real sign-in)

1. Open your Supabase project. Copy its Project URL and publishable key from the project Connect dialog / API settings. A legacy anon key is supported too. Never use a secret or service_role key in browser code.
2. In this project folder, run:

```bash
cp .env.example .env.local
open -e .env.local
```

Replace the placeholder values and save:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

3. In Supabase **Authentication → Sign In / Providers**, enable Email sign-in. For accounts created only by administrators, disable **Allow new users to sign up**. The portal does not provide public registration.
4. In **Authentication → Users**, use **Add user → Create new user** to create your first user with an email and password. Confirm that user's email (or enable Auto Confirm when creating a trusted test user). Do not share passwords in chat or commit them to GitHub.
5. In **Authentication → URL Configuration**, set Site URL to `http://127.0.0.1:5173`. Add `http://127.0.0.1:5173/**` and `http://localhost:5173/**` as development Redirect URLs. When deploying, add the exact production origin and recovery URL. Password reset links must return to `/?mode=recovery` on the app origin. If Vite uses a different port, update these URLs to match.
6. Stop the dev server with Ctrl+C, then run `npm install` and `npm run dev`. Vite reads environment variables when it starts; restart after editing `.env.local`.
7. Sign in with the account created in step 4. Refresh to verify the session persists, then use Sign out. To test recovery, select Forgot password, enter that account's email, follow the reset link and save a new password. For email delivery outside your project's permitted test recipients, configure Supabase custom SMTP.

`.env.local` is ignored by Git. `VITE_` values are included in browser builds: only the project URL and browser-safe publishable/anon key belong here. The client rejects secret/service_role keys.

## What works

- Supabase email/password sign-in with loading state, API/network error feedback and password visibility toggle.
- Session restore and automatic token refresh through the Supabase SDK.
- Sign-out on this browser, including auth state updates across tabs.
- Reset email request and password update screen after opening a recovery link.
- Demo workspace separately accessible without a login; it contains no live data.
- Responsive interface, accessible dialogs and keyboard navigation.

## Current scope and verification

See [automatic capture setup](docs/SETUP.md) for database activation and Chrome extension installation. Source access is limited to opened district eCourts cases. Case changes update automatically, with old/new values stored in a separate audit trail.

The production build has been checked. A live sign-in and email recovery test require your own configured Supabase project and account; these cannot be verified without them. No project keys or user credentials are included in this download.

Company workspaces, case records, automatic opened-case capture and a separate audit trail are now included. Activate them using [docs/SETUP.md](docs/SETUP.md). The SQL migration enforces workspace membership with Row Level Security; only the ingestion function writes cases and audits. Demo mode never queries private records. No approval or rejection workflow is used.

Google Fonts is optional: without internet, the page uses local fallback fonts.

## Edit the code

- `src/main.jsx`: login, dialogs, demo workspace and components.
- `src/lib/supabase.js`: client setup and browser-safe configuration checks.
- `src/useAuth.js`: auth state and session restore.
- `src/PasswordRecovery.jsx`: reset email and new password forms.
- `src/styles.css`: layout, colours, typography and mobile styles.
- `index.html`: browser title and metadata.

## GitHub repository

Source: https://github.com/kchddhanush-ui/verity-collections

Clone and run:

```bash
git clone https://github.com/kchddhanush-ui/verity-collections.git
cd verity-collections
npm install
cp .env.example .env.local
# Fill in your project URL and publishable key as described above.
npm run dev
```

If you already have a non-Git folder named `verity-collections`, clone into a separate folder to preserve your existing files and configuration:

```bash
cd /Users/nc25034-dhanush
git clone https://github.com/kchddhanush-ui/verity-collections.git verity-collections-github
cd verity-collections-github
cp ../verity-collections/.env.local .env.local
npm install
npm run dev
```

For later code changes, run from the cloned folder:

```bash
git add .
git commit -m "Update collections portal"
git push origin main
```

Pull future updates with `git pull --rebase origin main` after committing your local changes. `.env.local`, dependencies and build output are ignored by Git. Never commit passwords or private API keys.

## Production build check

```bash
npm run build
npm run preview
```

`npm run preview` is a local build preview, not a production server.

## Supabase references

- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/getting-started/api-keys

## Automatic capture and audit

- `extension/`: Manifest V3 extension, visible-case parser, connection popup and retry worker.
- `supabase/migrations/202610280001_case_capture_audit.sql`: workspace isolation and atomic capture/update/audit functions.
- `src/CaseWorkspace.jsx`: case list, connection setup, current details, separate audit and captured snapshots.
- `docs/SETUP.md`: activation, teammate membership, local Chrome installation and limitations.
- `tests/`: embedded PostgreSQL policy/transaction tests, synthetic parser fixtures and worker tests. Run `npm test`.

Live installation against your Supabase project and an actual eCourts session still needs to be verified. No live court data, extension credentials or private project keys are committed.

### Search listings and court totals

Extension 1.1.0 automatically saves loaded search-result rows and search-scoped court totals. Opening a case enriches its CNR with details; list captures never overwrite detailed status/history. Run the additional `202610290002_search_result_capture.sql` migration once, reload the extension and refresh eCourts. See the upgrade section in [docs/SETUP.md](docs/SETUP.md). Listing-only cases are shown separately from status-unknown detailed cases, with listing audits and immutable search snapshots.

### View a case from Lawcovery

Extension 1.2.0 connects the local dashboard's View/Refresh buttons to the existing eCourts tab. Complete the source search/CAPTCHA first; thereafter each requested listed case is opened through its live View control, checked by CNR, captured and saved with an audit. The dashboard updates after confirmed saves. Every case-number/View click requests fresh source details, even when already saved. Action-needed messages send you back to the court tab for missing search context, CAPTCHA or session renewal. Reload the extension and refresh both app/court tabs after pulling. No new migration is required. See the 1.2.0 section of [docs/SETUP.md](docs/SETUP.md).

Extension 1.2.1 keeps the court AJAX View handler but prevents default tokenised-link navigation. Clicking a case number opens an immediate dialog with loading status, details and any error, so feedback cannot be hidden above/below the results table. Reload the extension and refresh both pages after pulling this fix.

## Automatic sequential details — extension 1.3.0

Pull `feat/ecourts-auto-capture-audit`, restart Vite, reload the unpacked extension in Chrome and refresh both Lawcovery and eCourts. No new SQL is required. After completing CAPTCHA/search, the extension saves the loaded results and queues each valid CNR for a fresh detail fetch. Keep the source tab open. It uses the live View controls, waits for matching fresh case details and confirms the audited database save before advancing. Lawcovery displays saved/remaining/failed counts and refreshes the portfolio automatically. Pause/resume controls are in the dashboard and extension popup; an in-flight case may finish saving after pause.

There is a minimum five-second gap between cases. Hidden-tab timer throttling can slow processing; a durable 30-second alarm also wakes the queue. On CAPTCHA/session expiry, missing View controls, case mismatch or unconfirmed save, the queue stops and displays the reason. Correct the source/connection issue and choose Resume queue to retry that same case. Pending uploads are still retried by the existing upload queue; they are never counted as a confirmed batch save. Successfully rechecked unchanged cases retain snapshots without creating false field-change audits. Closing a source tab pauses on the next attempt; reopen/refresh and repeat the source search to create a new run.

Only the loaded result list is processed, up to the existing 2,000-row bound. No automatic pagination or search-filter changes. A refreshed source page or changed result list starts a new run, replacing the previous queue; retained identical rows within the same page do not restart a completed run. The queue is tied to the configured workspace connection and is cleared on disconnect/reconnect. The user still handles CAPTCHA. Live session validation is required after upgrading.

## Hearing calendar

Choose **Hearing calendar** beside **Cases** in a company workspace. The month view places case numbers on saved first/next hearing dates and the **Hearing Date** column of hearing history (not Business on Date). Entries for the same CNR/day are combined. Current next dates are marked **Next hearing**; other entries are **Recorded date**, not confirmation that a hearing actually occurred. Disposed cases retain history without a current next-date marker.

Navigate months, jump to Today or Next scheduled hearing, and search by case/CNR, party, court or purpose. Select a day to see all its cases, including those hidden behind the calendar's +more button. Click any case to open its saved details; Refresh from eCourts remains available separately. Automatic confirmed saves refresh the calendar alongside the portfolio. Dates remain calendar days across timezones, and Today follows India time. Only the loaded workspace portfolio is included; listed-only cases appear after detailed hearing dates are captured. No new SQL, extension update or package installation is needed for this calendar addition.

## Workspace layout

The workspace opens on **Overview**, with aligned case totals, stage counts and the latest search coverage. Desktop navigation stays in the sidebar; it becomes a compact navigation area on smaller screens. **Cases** contains the searchable case register, **Hearing calendar** contains court dates, and **Connections** contains company creation and browser connection settings. The selected company and refresh action stay in the workspace header.

At narrow table widths, the case register becomes labelled cards with the case identity first. Other data tables retain keyboard-accessible scrolling and sticky headers. The mobile calendar shows case counts on each day and the full case list below. Native case dialogs, visible keyboard focus and a skip-to-content link support keyboard use. Typography, forms, buttons, spacing and status colours are shared across the workspace, with sign-in/recovery alignment refinements. No new dependencies, SQL migrations or extension permissions are needed for this UI update.

## Decision Date — extension 1.3.1

Decision Date is captured as `data.decision_date`, independently of `data.disposal_date`, and appears in case details, snapshots and the separate old/new audit trail. Apply `supabase/migrations/202610290003_decision_date_capture.sql` after the existing migrations, then reload extension **1.3.1** and refresh both Lawcovery and eCourts. Only the explicit source field is saved; no date is inferred from disposal status or hearing history. Reopen a case or repeat a source search to capture dates previously missed. Blank or older captures do not erase a saved date. Detail format 1.1.0 requires the migration; legacy detail format 1.0.0 and search format 1.0.0 remain supported. See the setup guide for the Mac copy command.

## Lawcovery branding — extension 1.3.2

The product, website titles, sign-in/demo screens, workspace, extension popup and capture notices now use **Lawcovery**. Pull the feature branch, restart Vite, reload **Lawcovery Case Capture 1.3.2**, then refresh the website and eCourts tabs. Existing connection credentials, queues, saved cases and audit history continue to work. No new SQL or package installation is needed. GitHub repository URLs and existing local folder paths remain valid; internal message/storage identifiers are retained for compatibility with installed connections.

## Portfolio analytics

Select **Analytics** in the workspace navigation. It uses the same saved, CNR-merged portfolio as Cases, updates when that portfolio refreshes, and adds no new database writes or SQL migration. The analytics view loads separately from the main app.

Filter by court, case type, current status, stage or search text. Analytics is designed for company leadership and portfolio discussions. Eight headline metrics cover cases in view, pending/disposed counts, disposed share, average/median disposal TAT, pending cases over one year, and hearings within seven days. Charts cover status, stages, disposal-duration bands, monthly filings/disposals, pending age, next-30-day hearing workload, case types and disposal descriptions. The court table combines workload and average disposal TAT with its sample size. Portfolio priorities provide paginated lists for upcoming hearings, pending cases over one year, confirmed pending NBW/SUMMONS stages, and disposed cases; links open saved details.

Date-completeness, capture-recency, detail-coverage and judge/courtroom-distribution panels are excluded from this company-facing view. Technical follow-up categories (missing dates, stale checks and incomplete capture) are also removed from Analytics. Existing records and audits are retained. Court sync remains in Connections.

**Definitions:** status-unavailable includes records without a confirmed status, including listings awaiting details. Disposed share = disposed ÷ (pending + disposed); it does not indicate recovery or success. Average and median disposal TAT use the **same** sample of confirmed disposed cases with a valid Filing Date and Disposal Date, falling back to a valid Decision Date. Registration Date is not substituted for Filing Date in disposal TAT. Missing, future and reversed pairs are excluded; same-day disposal is zero days. Calendar days and sample sizes are explicit. Pending age uses Filing Date, falling back to Registration Date; “over one year” means more than 365 days. Monthly disposals use valid closure dates only on disposed records, independently of whether a filing date is usable for TAT. Trends describe the current selected cohort and do not reconstruct historical portfolio balances. Court counts describe the loaded portfolio, not all cases in a court. Report basis and methodology are available below the case lists; all calendar cutoffs use India time.


## Missing details and existing-case refresh — extension 1.4.1

The court-sync panel and extension popup now offer **Fetch missing details** and **Refresh existing details**. Missing means the CNR has no detailed `court_cases` record in the connected company; a saved search row alone is not a detail record. Every automatic search fetches missing details only. Refresh existing details is an explicit one-time run and does not carry into later searches. Clicking either option rechecks the original loaded search (up to 2,000 CNRs) against the database and starts a fresh queue for matching cases, including after the preceding queue completes. This uses server coverage rather than the dashboard's limited loaded portfolio.

Apply `supabase/migrations/202610300004_case_fetch_modes.sql`, reload extension **1.4.1**, and refresh both tabs. This read-only function returns only supplied CNRs and detail-presence flags for the active connection's workspace, validating membership, expiry/revocation, identities and request bounds. It grants no case/audit table access. Search saves succeed even when coverage fails; the detail queue stops visibly until the migration/connection is fixed and Resume queue succeeds. No fallback fetch-all behavior is used.

Before each selected case opens, coverage is checked again. Cases no longer matching the mode are skipped; confirmed saves, skips and processed totals are separate. Missing does not mean a particular field is blank: use Refresh existing details to acquire Decision Date or other new fields on an already-saved detail record. Existing cases update through the same transactional snapshot/old-new audit mechanism with no approval step. Unchanged refreshes create a check snapshot without a false field-change audit. Keep the live source search tab open and complete any required CAPTCHA; only those loaded results are processed. Manual case-number/View and explicit case Refresh requests still fetch the selected case regardless of bulk mode.


### Missing-only correction in 1.4.1

Version 1.4.0 remembered the previous fetch mode, so choosing Refresh existing details could cause the next source search to refresh already-saved cases again. Version 1.4.1 always classifies automatic searches as missing-only, ignoring that old preference. Existing saved queues created by older versions are reclassified before processing/resuming; only new explicit refresh requests retain permission to refresh existing cases for that run. Before-run saved/missing counts make selection visible in the popup/dashboard. When all details already exist, no case page is opened. Each selected missing target is still rechecked before source navigation, and audit/snapshot storage remains unchanged.

Pull, reload **Lawcovery Case Capture 1.4.1**, and refresh both tabs. The dashboard detects an older running extension and displays reload instructions; restarting Vite alone does not update Chrome's loaded extension. No additional SQL or dependencies are introduced by this correction; the existing `202610300004_case_fetch_modes.sql` migration remains required for coverage checks.


## UI from the supplied redesign

The workspace uses the final indigo design from `Modernize and Redesign App.zip`, adapted to the existing live application. `src/reference-ui.css` contains scoped reference styles; `src/workspace-theme.css` layers existing table/dialog/calendar structure beneath them, and `src/reference-adapter.css` binds the design to working controls. `WorkspaceChrome` reproduces the sidebar, header search, account dropdown and mobile drawer. `WorkspaceOverview` binds the reference cards and charts to the existing company portfolio. The provided favicon and local SVG icon paths are reused. No prototype datasets, fixed account identities, Figma build plugins or new runtime dependencies are added.

Overview, Analytics, Cases, Hearing calendar and Connections keep their existing data flow. Analytics presents four primary cards, the monthly trend, priorities and court workload first; its existing TAT/stage breakdowns remain in Detailed portfolio insights. Company presentation remains available from Overview. Header search, navigation, profile/account information and successful-sync feedback are functional; backend integration and the sign-in flow are retained. See docs/SETUP.md for usage.

### Start a Party Name search in Lawcovery

Reload extension **1.6.0** in Chrome and refresh Lawcovery. In a connected workspace, open **Connections → Search by party name → Load court options**. Choose the court, enter the party name, year and status, then select **Continue to CAPTCHA**. Type the displayed code in Lawcovery and select **Search eCourts**. Use **Get a new CAPTCHA** for a fresh image or **Open this search in eCourts** for the official form and audio option. Results follow the existing audited save flow. The challenge and answer are used only for the current browser search.
