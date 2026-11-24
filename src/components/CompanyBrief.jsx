import React, { useMemo, useState } from "react";
import { buildAnalytics } from "../lib/analytics";
import "../brief.css";
export function CompanyBrief({ cases, company }) {
  const model = useMemo(() => buildAnalytics(cases), [cases]);
  const [presenting, setPresenting] = useState(false);
  const number = value => value == null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return <section className={`company-brief ${presenting ? "brief-presenting" : ""}`} aria-label="Company presentation">
    <div className="brief-toolbar"><span>LAWCOVERY / COMPANY BRIEF</span><button onClick={() => setPresenting(!presenting)}>{presenting ? "Exit presentation" : "Present company brief"}</button></div>
    <p className="brief-eyebrow">{company} · LEGAL PORTFOLIO</p>
    <h2>From court records<br />to a clearer business picture.</h2>
    <p className="brief-intro">Understand case progress, measure time to disposal, and plan the next hearing from one company workspace.</p>
    <div className="brief-numbers">{[["Cases in portfolio", number(model.total)], ["Disposed cases", number(model.disposed)], ["Average disposal TAT", model.averageTat == null ? "—" : `${number(model.averageTat)} days`], ["Hearings in 7 days", number(model.next7.length)]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="brief-method">Average TAT: filing date to disposal date, using Decision Date when disposal date is unavailable. Based on {model.tatSamples} of {model.disposed} disposed cases with valid chronological dates. Missing dates are excluded.</p>
    <div className="brief-story"><article><span>01 / VISIBILITY</span><h3>A portfolio you can explain.</h3><p>{model.pending} pending · {model.disposed} disposed · {model.unknown} unknown status · {model.listed} awaiting details.</p></article><article><span>02 / EXECUTION</span><h3>Know what comes next.</h3><p>{model.upcoming.length} cases have a saved next hearing in the next 30 days. Review dates and stages with your team.</p></article><article><span>03 / ACCOUNTABILITY</span><h3>Keep the history behind the numbers.</h3><p>Automatic case updates retain separate snapshots and field-change audits for your company workspace.</p></article></div>
    <div className="brief-close"><h3>Start with your company’s case portfolio.</h3><p>Capture your cases, review the analytics, and use the hearing calendar to plan follow-up.</p></div>
    <small>Scope: currently loaded company records, up to 1,000 details and 1,000 listings merged by CNR. Disposed status does not establish recovered money or a favourable outcome. Figures reflect saved court records.</small>
  </section>;
}
