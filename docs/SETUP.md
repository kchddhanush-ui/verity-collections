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

## Upgrade to search-result capture (extension 1.1.0)

This upgrade adds automatic capture of the visible search-result table as well as opened case pages.

1. Pull the latest `feat/ecourts-auto-capture-audit` branch.
2. In Supabase SQL Editor, run **only** `supabase/migrations/202610290002_search_result_capture.sql` once. The original migration must already be installed; do not rerun it. This adds separate listing, search snapshot and listing-audit tables without modifying your existing detailed cases.
3. Restart the website. In `chrome://extensions`, click **Reload** for Verity Case Capture. Refresh the eCourts tab. Existing valid workspace connections are preserved; reconnect only if expired or revoked.
4. Search normally with CAPTCHA. Once the result table loads, look for **Search saved · N cases listed**. Opening a View link still captures the detailed case automatically.
5. Refresh Verity to see the combined portfolio and the latest search's establishments, reported total and per-court totals.

**What is saved:** row number, case type/number/year, petitioner/respondent text, court and CNR. The CNR is read from the row's existing View-link attribute; no View links are followed automatically. Only the currently visible result table is processed. Source links/session tokens, CAPTCHA and other form contents are not copied. Selected location labels and party-search criteria are saved as context when available.

**Two levels of coverage:** a listed case has identity and party details only. It is marked **Listed only** until you open its detail page. A detailed record is joined by workspace + CNR. The list never overwrites case status, stage, hearing history or other detailed fields. Existing detailed cases need not be reopened merely to link them to a listing.

Overall/stage counts use detailed records. **Awaiting details** counts listing-only cases, which do not get labelled unknown status. The portfolio counts distinct CNRs, not loans or respondents; separate P.C.R. and C.C. case identities remain separate.

**Court totals are search-scoped:** “563 cases” means the total reported for that court/filter/year search. It is not all cases for the company nationwide. Overlapping searches are retained separately, not summed. New results do not delete cases missing from that search. If only some results are loaded/paginated, only those loaded rows are stored; there is no automatic page navigation or CAPTCHA bypass. Up to 2,000 rows and 1.5 MB per page capture are supported. Larger pages fail visibly rather than being silently truncated.

The dashboard loads up to 1,000 listing records and 1,000 detailed records and combines them by CNR. It shows metadata for the 10 latest search captures. Stored snapshots are retained in Supabase; they are not truncated by dashboard display limits.

**Audit:** every search capture has an immutable, dated snapshot. A new listing or changed listing adds a separate old/new listing audit, visible in the case's Audit history. Unchanged rechecks retain their search snapshot without duplicate change events. Row-number-only changes are not treated as a case-data change. Listing updates, audits and the page snapshot commit in one transaction; stale observations cannot replace newer listing data.

Connections and automatic-capture privacy: enabling the extension now includes visible search results and selected search context. Pause the extension before searches you do not want saved in the receiving workspace. Failed uploads use the existing bounded retry queue, additionally capped at 4 MB of pending data.

## Upgrade to View from Verity (extension 1.2.0)

No new database SQL is needed if both earlier migrations are already installed.

1. Pull this branch and restart `npm run dev`.
2. In `chrome://extensions`, reload Verity Case Capture and confirm **1.2.0**. Chrome may ask you to allow the additional localhost dashboard access.
3. Refresh **both** the Verity page and the eCourts tab so their updated scripts load.
4. Keep your existing valid extension connection. This release supports the local dashboard at `http://127.0.0.1:5173` or `http://localhost:5173`. For a different local port, create a new connection from that page; its settings include `app_origin`.
5. On eCourts, complete CAPTCHA and run a search. Leave that tab open, then return to Verity and refresh the listings once if needed.
6. Click **View** on a listed-only case in Verity. The extension uses the matching live View control in the existing eCourts tab. The dashboard displays fetching progress, saves the loaded details with the existing audit transaction, and reloads that case without a manual dashboard refresh after a confirmed save.
7. Clicking View/the case number always requests a fresh load from eCourts, including already-saved cases. The Refresh from eCourts button can repeat that same action from the detail panel. Saved data is retained if the fetch fails.

This is single-case, user-triggered processing, not a bulk crawler. It never solves CAPTCHA, follows guessed/private endpoints, stores court session URLs, or automatically changes court/search filters. Live View controls must still be present in an open eCourts tab for a fresh fetch. The portal normally retains the current search rows while showing a case; if your desired case is no longer in that live search, repeat its search on eCourts and retry. Every dashboard View/Refresh requires a new page update and will not treat an already-open, unchanged old page as a fresh response.

**When action is needed:** if the tab/session has closed, the source needs CAPTCHA, the case cannot be matched, or it does not load within the content-script wait, Verity shows the failure rather than claiming it saved. Click **Go to eCourts tab**, complete the necessary action, then retry View/Refresh. Some Chrome background-tab throttling or court-site behaviour may require bringing the source tab to the foreground. Only one case-navigation request can run at a time. Uploads that enter the retry queue show pending, not success; refresh the portfolio after the extension reports they synced.

**Account isolation:** the dashboard request carries its current Supabase login token through the local extension bridge to the configured Supabase project. The extension uses the existing authenticated connection-list function to verify that this is the account and workspace that own its active upload connection, then checks that the connection is still valid. A mismatched account, project, origin or workspace is rejected. The dashboard never receives the extension's upload credential or raw court page. Its login token is used transiently and not saved by the extension. Connection changes during navigation cancel the save instead of sending it to another workspace.

The bridge runs only on localhost/127.0.0.1 pages and checks the exact configured dashboard origin. The initial dashboard integration is local-only; hosted Verity domains need an explicit extension origin configuration in a later release. Existing connections created before 1.2.0 default to the two port-5173 origins above. Keep the source tab open and sign into the same workspace account that created the connection.

### 1.2.1: visible case dialog and AJAX navigation fix

Pull the latest code, reload extension **1.2.1**, and refresh both Verity and the eCourts tab. No new SQL is needed. A case-number click now immediately opens a modal containing the selected case, fetching progress, results and any error. Details and status are no longer separated above/below the long results list. Closing the dialog does not cancel an already-authorised upload; the portfolio can update when it finishes, but the dialog will not reopen unexpectedly.

The targeted court View action now prevents following the link's session-bound href while allowing its normal case-loading handler to run. This avoids an additional page navigation disconnecting the pending response. CAPTCHA/session and missing-search restrictions still apply. If the live save fails, send the message shown **inside the case dialog** (without connection settings) so the exact remaining failure can be identified.

## Automatic sequential details — extension 1.3.0

Pull `feat/ecourts-auto-capture-audit`, restart Vite, reload the unpacked extension in Chrome and refresh both Verity and eCourts. No new SQL is required. After completing CAPTCHA/search, the extension saves the loaded results and queues each valid CNR for a fresh detail fetch. Keep the source tab open. It uses the live View controls, waits for matching fresh case details and confirms the audited database save before advancing. Verity displays saved/remaining/failed counts and refreshes the portfolio automatically. Pause/resume controls are in the dashboard and extension popup; an in-flight case may finish saving after pause.

There is a minimum five-second gap between cases. Hidden-tab timer throttling can slow processing; a durable 30-second alarm also wakes the queue. On CAPTCHA/session expiry, missing View controls, case mismatch or unconfirmed save, the queue stops and displays the reason. Correct the source/connection issue and choose Resume queue to retry that same case. Pending uploads are still retried by the existing upload queue; they are never counted as a confirmed batch save. Successfully rechecked unchanged cases retain snapshots without creating false field-change audits. Closing a source tab pauses on the next attempt; reopen/refresh and repeat the source search to create a new run.

Only the loaded result list is processed, up to the existing 2,000-row bound. No automatic pagination or search-filter changes. A refreshed source page or changed result list starts a new run, replacing the previous queue; retained identical rows within the same page do not restart a completed run. The queue is tied to the configured workspace connection and is cleared on disconnect/reconnect. The user still handles CAPTCHA. Live session validation is required after upgrading.

## Hearing calendar

Pull the feature branch, restart Vite and refresh Verity. Select a workspace, then choose **Hearing calendar** beside **Cases**. No extra SQL or extension reload is required for this dashboard addition.

The calendar reads already-saved first/next hearing dates and hearing-history dates. The source's Hearing Date column is used, not Business on Date. Repeated records for one case/date are merged; multiple cases on one date remain separate. Current next hearings are labelled, while history/first-hearing entries are shown as recorded dates. These entries do not assert a hearing took place. Disposed cases retain recorded history without a next-hearing marker. Invalid/unknown dates are omitted and undated cases are counted below the calendar. No future dates are inferred.

Use the arrows or month picker to navigate. Today follows India time; Next scheduled hearing jumps to the earliest saved next date on/after today. Search by case/CNR, parties, court or purpose. Select a day or +more to see its complete case list. A case-number click opens saved case details without making a new court request; the dialog's Refresh from eCourts button can request one explicitly. The same workspace isolation, loaded-portfolio limit and existing automatic-save/audit behaviour apply.

## Workspace UI refresh

Pull the feature branch, restart Vite and refresh Verity. The landing view is now **Overview**. Use **Cases** for the case register, **Hearing calendar** for hearing dates and **Connections** to create/manage a browser connection or create another company workspace. On smaller screens, navigation wraps and the case register uses labelled cards. Select a calendar day/count to view the complete case list below the month. Capture progress, pause/resume and the audited saving behaviour continue across workspace views. No SQL, package install or extension reload is required for this layout update.
