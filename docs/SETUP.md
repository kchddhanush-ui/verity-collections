# Activate automatic case capture

## 1. Get this branch locally

Keep your existing `.env.local`; do not commit it. In your existing Git clone:

```bash
git fetch origin
git switch feat/ecourts-auto-capture-audit
npm install
```

If your folder was only extracted from a ZIP, clone separately so nothing is overwritten:

```bash
cd /Users/nc25034-dhanush
git clone -b feat/ecourts-auto-capture-audit https://github.com/kchddhanush-ui/verity-collections.git verity-collections-capture
cd verity-collections-capture
cp ../verity-collections/.env.local .env.local
npm install
```

## 2. Create database tables and functions

Open your existing Supabase project → SQL Editor → New query.
Copy the **entire** contents of `supabase/migrations/202610280001_case_capture_audit.sql`, then Run once.
It creates workspaces, memberships, cases, captured snapshots, connections and audit history. The existing authentication users remain intact. If tables with these names already exist, stop and reconcile their definitions before running this migration; do not drop your existing tables.

No extra private backend key or paid court API is required. The authenticated PostgreSQL functions are the backend. The extension uses a scoped, expiring upload credential. Supabase project quotas/storage/billing still apply.

Existing `.env.local` values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

A legacy anon key is also supported. Never use a service-role or secret key in the app or extension. This extension release supports hosted `*.supabase.co` projects, not custom Supabase domains or local Supabase.

## 3. Start Verity and create a workspace

```bash
npm run dev
```

Sign in with your existing Supabase email/password. Create your company workspace. Data is visible only to workspace members. Creating an authentication user alone does **not** grant company-data access.

To give a teammate access, a trusted database administrator can run the following in the Supabase SQL Editor after replacing both UUIDs:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('WORKSPACE_UUID', 'AUTH_USER_UUID', 'member');
```

Find workspace IDs in the `workspaces` table and the user's ID under Authentication → Users. Only administrators with SQL access provision teammates in this release. Removing a membership immediately prevents its connections from uploading and its user from reading that workspace.

## 4. Load the Chrome extension locally

1. Open `chrome://extensions` in Chrome desktop.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository's **extension** directory, not the repository root.
5. Pin **Verity Case Capture** using Chrome's Extensions menu.

This is a development installation, not a Chrome Web Store release. Each teammate needs their own extension installation and their own account connection.

## 5. Connect once

1. In Verity, select the receiving company workspace.
2. Expand **Connect Chrome for automatic capture**.
3. Click **Create extension connection**.
4. Copy the private connection JSON shown there.
5. Open the extension popup and paste it.
6. Click **Connect and enable auto-save**.
7. Chrome will request access to your exact Supabase project. Grant that access to allow uploads.
8. Confirm the receiving company shown in the extension.

There is no per-case Import button or approval step. Creating a connection enables automatic capture of opened case pages. Pause capture from the extension when browsing cases you do not want stored in that workspace.

Connection JSON is a secret: anyone who has it can submit captures to that workspace as the creating user. It does not permit reading records. Do not share it, commit it, paste it into court forms, or include it in screenshots. Only its SHA-256 hash is stored in the database. It expires after 30 days; use **Revoke** in Verity to invalidate it earlier.

Disconnect clears credentials/queued captures from this browser but does not revoke a copied credential. Revocation invalidates the credential server-side. Signing out through Verity revokes **all** of that account's capture connections; create a new connection after signing in again. Changing the workspace in the website does not silently change the extension's destination: disconnect and create/connect the intended workspace credential.

## 6. Use eCourts normally

1. Open https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index
2. Search and complete CAPTCHA yourself.
3. Click **View** on a case.
4. Leave the case visible while its details load.
5. The extension shows **Case saved**, **Case updated**, or **Case checked · no changes** after backend confirmation.
6. Return to Verity and click **Refresh cases**.
7. Open a saved case, then **Audit history** or **Capture checks**.

If the portal was open before you installed/reloaded the extension, refresh that portal tab once. Enabling/resuming a connected extension also scans a currently opened case.

Only one visible case-detail section is captured. Search result lists, hidden cases and other sites are not imported. Opening another case automatically captures that case. Loaded acts, processes and history are included; hearing-business details opened in separate modals and PDF contents are not captured in this release. Order tables are retained as loaded text rows when present; order downloading is not implemented.

## 7. Verify the complete flow

Use a public test case appropriate for your organisation:

- Open case → check one current record, a creation audit and capture snapshot.
- Navigate away and reopen unchanged → another check, no extra change audit.
- On a later visit when the official data changes → current record updates and a field-by-field old/new audit appears.
- Pause → opening cases does not upload.
- Revoke → future uploads fail and the extension pauses.
- Sign in as a user outside the workspace → records are not visible.

Do not edit the official portal to manufacture changes. Automated regression tests use synthetic data and cover changed fields without altering live court pages.

## Reliability and limitations

- Captures are observations, not court-certified evidence. A connected user/browser can submit altered data; source labels do not cryptographically prove provenance.
- Current data and audit entry are saved together. An audit error rolls back the update.
- CNR plus workspace prevents duplicates. An unchanged page records a check; stale captures are retained without overwriting newer observations.
- Missing/blank fields do not erase existing values. A disposed capture explicitly removes an old pending hearing date when absent, with an audit entry.
- Snapshots contain extracted fields, not the entire original webpage, forms or CAPTCHA. Source URLs are canonical and exclude session tokens.
- Network failures queue up to 20 captures locally, with at most three attempts per capture. Queues survive worker restart; changing connections or disconnecting clears them. Expired/revoked credentials require reconnecting; exhausted retries require revisiting the case.
- Reloading/changing the extension can interrupt a pending browser response. Reopen the case to retry; database capture IDs make network retries idempotent.
- The dashboard loads up to 1,000 recent cases; each case shows up to 100 recent audit/check entries. Counts are for that loaded portfolio. Refresh is manual in this release; no background court crawler is included.
- Court layouts and missing identifiers can prevent extraction. Do not treat an extraction failure as proof that the case has no history.
- This parser was developed from a supplied saved district eCourts page. Live Chrome + your Supabase project validation is still required. High Courts, Supreme Court and other portals are not covered yet.
- No API fee is paid to eCourts by this implementation. Hosting, database and maintenance are separate costs. Confirm applicable source access/reuse conditions for your commercial use.

## Development checks

```bash
npm test
npm run build
```

Tests run the actual SQL migration/functions in embedded PostgreSQL with pgcrypto, verify tenant policies and atomic rollback, parse a synthetic fixture based on the supplied page, and exercise the extension worker with browser/HTTP mocks. No live credentials or real legal records are committed in fixtures.

After updating extension code: click **Reload** for the extension in `chrome://extensions`, then refresh the eCourts tab.
