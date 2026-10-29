# Chrome Web Store Listing — Verity Case Capture

Last updated: 2026-10-28. Development installation only; not submitted or published.

## Store listing draft

**Name:** Verity Case Capture

**Short description:** Automatically save opened eCourts cases to your connected Verity workspace, with a separate audit history.

**Detailed description:** Connect your Verity company workspace once, then automatically save case details as you open them on district eCourts. Keep case stages, hearing dates, parties, processes and loaded hearing history together. View previous and new values in a separate audit history. Pause capture anytime. You complete court searches and CAPTCHA yourself. Data is sent only to your configured company database.

**Category:** Productivity. **Language:** English.

**Single purpose:** Save the details of cases opened on district eCourts to the user's connected Verity workspace.

## Assets

Store icon and screenshots have not been created. No icon paths are declared in the development manifest. Store publication requires real assets and publisher-provided support/privacy details.

## Permissions justification

| Permission | Purpose |
|---|---|
| storage | Keep the workspace connection locally and preserve bounded pending uploads across browser worker restarts. Secrets are restricted to trusted extension contexts. |
| alarms | Retry failed uploads up to three attempts without polling court websites. |
| https://services.ecourts.gov.in/* | Read supported opened case pages and show capture status; never solve CAPTCHA. |
| Optional https://*.supabase.co/* | Allows asking for the user's exact Supabase project origin when connecting; sends captures to that project. |

No all-sites, cookies, downloads, browsing-history or remote-code execution permission is requested.

## Privacy and data use

Collected and transmitted: loaded case text including party/advocate names, court identifiers, status, dates, Acts, processes and hearing-history rows. User activity consists of capture timestamps and the fact a case was opened. Full browsing history, CAPTCHA contents, court session tokens and unrelated page forms are not collected. Financial/legal information may be present in court text; only extract fields needed by this feature.

Authentication credential: a scoped 30-day upload token is stored locally, not synced across browsers. It is transmitted to the configured Supabase project only. Project URL and browser-safe key are also stored locally. Pending extracted captures are stored locally until uploaded, exhausted, disconnected or a connection is replaced. Uploaded snapshots/audits are retained by the workspace administrator's database policy; no automatic retention deletion is implemented.

No advertising, data sale or separate analytics collection is implemented. The company database is hosted by Supabase. The publisher must accurately complete store disclosures, define retention/support, and confirm commercial source-use conditions before submission. Do not assert the lending-purpose certification without evaluating the intended collections use.

## Privacy policy and publisher

Not supplied: live privacy policy URL, publisher name, public contact email, distribution audience/regions. These must be provided before publication; local development does not constitute store readiness.

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 1.0.0 | 2026-10-28 | Opened-case capture, workspace connection, pause, bounded retry, automatic audited updates | Development draft |

## Known limitations

District eCourts only; loaded fields only; PDFs and modal business details excluded. Live installation validation remains required. No store review or court endorsement is claimed.

## Version 1.1.0 — 2026-10-29 (development draft)

Automatically capture the loaded search-result table, row identities/parties, selected location and party-search context, and search-scoped establishment/court totals. Opening a case enriches the matching CNR. Show listed-only versus detailed coverage and preserve listing snapshots/audits separately. No new permissions. The existing eCourts host access now reads visible result tables as well as opened detail sections; optional Supabase origin access sends both capture types. The privacy disclosure must include search criteria and result-table text. Full browsing history, CAPTCHA and session tokens remain excluded. Pending uploads are bounded at 4 MB. Store submission/privacy policy and assets remain pending.

## Version 1.2.0 — 2026-10-29 (development draft)

View a listed case from the local Verity dashboard to fetch its loaded details through an existing eCourts tab. Stored cases open immediately; a separate refresh action requests fresh source details. Show progress, confirmed-save status and action-needed messages, with a user-triggered focus button for CAPTCHA/session issues. No CAPTCHA automation, arbitrary URL navigation or bulk case processing.

Additional declared content-script access: `http://localhost/*` and `http://127.0.0.1/*`. Purpose: receive explicit View/Refresh requests from the local Verity dashboard and return progress/result statuses. Messages are gated on the configured exact app origin and an authenticated same-account/workspace check against the configured Supabase project. The dashboard's login JWT is transiently transmitted to that same Supabase project for authorization; it is not persisted, included in pending queues, logged or sent to eCourts. The upload token stays inside trusted extension contexts. A last-used court tab ID is retained locally to support Go to eCourts. No new broad browser tabs/history/cookie permission is declared; existing eCourts host access allows targeting its tabs.

Privacy/store disclosure must cover the local dashboard message bridge, transient authentication-token processing and user-requested case navigation. Hosted dashboard origins are not supported by this initial bridge. Store publication remains pending the same required publisher, privacy-policy and asset work.
