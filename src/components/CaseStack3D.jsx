import React from "react";

// A purely decorative 3D stack of case cards, built from CSS transforms.
// The homepage drives it with the --p scroll variable (0 = stacked and tilted,
// 1 = fanned out and facing the reader); the login page lets it float gently.
// All figures are illustrative - this is a public page, never client data.
export function CaseStack3D({ idle = false }) {
  return (
    <div className={`cs3d ${idle ? "is-idle" : ""}`} aria-hidden="true">
      <div className="cs3d-stage">
        <div className="cs3d-card cs3d-file" style={{ "--i": 0 }}>
          <div className="cs3d-row">
            <span className="cs3d-chip">Case file</span>
            <span className="cs3d-muted">LR-2047</span>
          </div>
          <strong className="cs3d-title">Account 90+ DPD</strong>
          <span className="cs3d-line" style={{ "--w": "82%" }} />
          <span className="cs3d-line" style={{ "--w": "64%" }} />
          <span className="cs3d-line" style={{ "--w": "72%" }} />
          <div className="cs3d-row cs3d-foot">
            <span>Legal review</span>
            <span className="cs3d-dot" />
          </div>
        </div>

        <div className="cs3d-card cs3d-hearing" style={{ "--i": 1 }}>
          <div className="cs3d-row">
            <span className="cs3d-chip is-amber">Next hearing</span>
            <span className="cs3d-muted">Court 12</span>
          </div>
          <div className="cs3d-date">
            <b>04</b>
            <span>Dec<br />Summons</span>
          </div>
          <div className="cs3d-steps">
            <i className="is-done" />
            <i className="is-done" />
            <i className="is-now" />
            <i />
          </div>
        </div>

        <div className="cs3d-card cs3d-recovery" style={{ "--i": 2 }}>
          <div className="cs3d-row">
            <span className="cs3d-chip is-green">Recovery tracked</span>
            <span className="cs3d-check">✓</span>
          </div>
          <strong className="cs3d-figure">68%</strong>
          <span className="cs3d-meter"><i /></span>
          <div className="cs3d-row cs3d-foot">
            <span>Recovered</span>
            <span>Outstanding</span>
          </div>
        </div>
      </div>
      <div className="cs3d-shadow" />
    </div>
  );
}
