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
