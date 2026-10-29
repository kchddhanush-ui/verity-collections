# Verity — Legal collections portal

An independent React + Vite project. “Verity” is a working product name that can be changed. This project is not deployed and has no dependency on ChatGPT Sites hosting.

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

### View a case from Verity

Extension 1.2.0 connects the local dashboard's View/Refresh buttons to the existing eCourts tab. Complete the source search/CAPTCHA first; thereafter each requested listed case is opened through its live View control, checked by CNR, captured and saved with an audit. The dashboard updates after confirmed saves. Every case-number/View click requests fresh source details, even when already saved. Action-needed messages send you back to the court tab for missing search context, CAPTCHA or session renewal. Reload the extension and refresh both app/court tabs after pulling. No new migration is required. See the 1.2.0 section of [docs/SETUP.md](docs/SETUP.md).

Extension 1.2.1 keeps the court AJAX View handler but prevents default tokenised-link navigation. Clicking a case number opens an immediate dialog with loading status, details and any error, so feedback cannot be hidden above/below the results table. Reload the extension and refresh both pages after pulling this fix.
