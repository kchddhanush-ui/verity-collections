import React, { useEffect, useId, useState } from "react";
import { LawcoveryLogo } from "./LawcoveryLogo";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";
import "../public-site.css";

const services = [
  ["briefcase", "Legal recovery, built around your portfolio.", "A focused approach to hard-to-recover 90+ DPD accounts, bringing legal and recovery teams into one coordinated workflow."],
  ["shield", "Execution that reaches the ground.", "Pan-India warrant execution across urban and rural jurisdictions, supported by structured legal processes."],
  ["cases", "Visibility through every legal stage.", "Follow case progress, hearing dates and saved court updates, with a separate history of changes in your company workspace."],
];

const partners = [
  { name: "Commercial banks", focus: "Retail & commercial NPAs", title: "A focused approach to retail and commercial NPAs.", description: "Bring difficult overdue portfolios into a structured legal recovery workflow, with coordinated execution and visibility over case progress.", tags: ["Retail portfolios", "Commercial accounts", "Legal-stage tracking"] },
  { name: "NBFCs", focus: "Secured & unsecured books", title: "Recovery for secured and unsecured books.", description: "Connect legal strategy and recovery execution for deep-default accounts, while keeping your team informed about the progress of each case.", tags: ["Secured lending", "Unsecured lending", "90+ DPD accounts"] },
  { name: "LSPs & fintechs", focus: "Digital loan defaults", title: "A legal recovery path for digital loan defaults.", description: "Support overdue digital lending portfolios with an integrated legal and recovery approach, backed by shared case visibility.", tags: ["Digital lending", "Deep-default portfolios", "Integrated recovery"] },
];

const steps = [
  ["Understand the portfolio", "Start with the account context, available records and the recovery challenges in your portfolio."],
  ["Plan the legal approach", "Bring the legal and recovery teams together around a structured course of action."],
  ["Coordinate execution", "Follow through on the ground, across the jurisdictions relevant to your cases."],
  ["Keep progress visible", "Track legal stages, upcoming hearings and the history behind case updates."],
];

function RecoveryVisual() {
  const id = useId();
  return <figure className="lp-visual">
    <svg viewBox="0 0 560 460" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-folder`} x1="118" y1="100" x2="440" y2="390" gradientUnits="userSpaceOnUse"><stop stopColor="#494080"/><stop offset="1" stopColor="#211c48"/></linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f4e3ac"/><stop offset=".5" stopColor="#b98d4a"/><stop offset="1" stopColor="#f1d48e"/></linearGradient>
        <linearGradient id={`${id}-route`} x1="42" y1="360" x2="490" y2="76" gradientUnits="userSpaceOnUse"><stop stopColor="#6a5ce500"/><stop offset="1" stopColor="#8fe9eb"/></linearGradient>
      </defs>
      <ellipse cx="294" cy="402" rx="210" ry="24" fill="#0e0d26" fillOpacity=".45"/>
      <circle cx="290" cy="232" r="182" stroke="#d5cdff" strokeOpacity=".1"/>
      <circle cx="290" cy="232" r="216" stroke="#d5cdff" strokeOpacity=".05" strokeDasharray="4 10"/>
      <path d="M40 358C130 358 108 287 214 287S345 214 377 151 454 98 501 69" stroke={`url(#${id}-route)`} strokeWidth="3"/>
      <path d="m476 67 26 1-9 24" stroke="#8fe9eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <g transform="rotate(8 282 238)">
        <rect x="162" y="99" width="278" height="282" rx="19" fill="#e7e5f4"/>
        <rect x="187" y="124" width="121" height="8" rx="4" fill="#aaa3c7"/>
        <rect x="187" y="147" width="203" height="5" rx="2.5" fill="#cbc5de"/>
        <rect x="187" y="164" width="162" height="5" rx="2.5" fill="#cbc5de"/>
      </g>
      <path d="M112 169a20 20 0 0 1 20-20h88l26 28h163a23 23 0 0 1 23 23v163a23 23 0 0 1-23 23H135a23 23 0 0 1-23-23Z" fill={`url(#${id}-folder)`} stroke="#9c90cf" strokeOpacity=".55"/>
      <path d="M112 197h320" stroke="#a99ad6" strokeOpacity=".3"/>
      <rect x="139" y="221" width="8" height="8" rx="4" fill="#8fe9eb"/>
      <text x="158" y="229" fill="#c5bedf" fontSize="11" fontFamily="sans-serif" letterSpacing="2">RECOVERY PORTFOLIO</text>
      <text x="137" y="296" fill="#f8f6ff" fontSize="57" fontWeight="700" fontFamily="sans-serif" letterSpacing="-2">90+ DPD</text>
      <path d="M140 320h199" stroke="#cfc7ed" strokeOpacity=".25"/>
      <text x="140" y="350" fill="#a9dedf" fontSize="12" fontFamily="sans-serif">A clear path to the next step.</text>
      <g transform="translate(377 285)">
        {[64, 47, 30, 13].map((y) => <g key={y}><path d={`M0 ${y}v13c0 13 91 13 91 0V${y}`} fill={`url(#${id}-gold)`}/><ellipse cx="45.5" cy={y} rx="45.5" ry="11" fill="#e9cc86" stroke="#a78145"/></g>)}
        <ellipse cx="45.5" cy="13" rx="31" ry="6" stroke="#b99551"/>
      </g>
      <g transform="rotate(-35 438 180)">
        <rect x="429" y="152" width="17" height="124" rx="8.5" fill={`url(#${id}-gold)`}/>
        <rect x="394" y="127" width="88" height="44" rx="9" fill="#30233c" stroke="#e6c389" strokeWidth="2"/>
        <path d="M406 129v40M470 129v40" stroke="#dab777" strokeWidth="7"/>
      </g>
      <circle cx="115" cy="120" r="24" fill="#8fe9eb" fillOpacity=".11" stroke="#8fe9eb" strokeOpacity=".4"/>
      <path d="m105 120 7 7 13-15" stroke="#8fe9eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="477" cy="384" r="4" fill="#8fe9eb"/>
      <circle cx="79" cy="286" r="3" fill="#b4a6ff"/>
    </svg>
    <figcaption>Legal expertise. Ground-level execution. Shared visibility.</figcaption>
  </figure>;
}

export function PublicLanding() {
  const [partner, setPartner] = useState(0);
  useEffect(() => {
    const target = window.location?.hash?.slice(1);
    if (["public-content", "services", "results", "process", "partners"].includes(target)) {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
    }
  }, []);
  const current = partners[partner];
  return <div className="public-site">
    <a className="lp-skip" href="#public-content">Skip to content</a>
    <header className="lp-header">
      <a className="brand lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo/></a>
      <nav className="lp-nav" aria-label="Main navigation">
        <a href="#services">What we do</a><a href="#results">Our results</a><a href="#partners">Partners</a>
        <a className="lp-login" href="?view=login">Client login <Icon name="arrow" size={17}/></a>
      </nav>
    </header>
    <main id="public-content" tabIndex="-1">
      <section className="lp-hero" aria-labelledby="public-title">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker"><span/> LEGAL RECOVERY FOR 90+ DPD PORTFOLIOS</p>
            <h1 id="public-title">Overdue portfolios.<br/><em>A clear way forward.</em></h1>
            <p className="lp-hero-intro">Specialised legal recovery for the accounts that need more than another reminder. We bring legal action, on-ground execution and case visibility together.</p>
            <div className="lp-actions"><a className="lp-button lp-button-accent" href="#services">Explore our approach <Icon name="arrow" size={18}/></a><a className="lp-text-link" href="#results">See our track record <span aria-hidden="true">↗</span></a></div>
            <p className="lp-affiliation">A recovery arm of <strong>ninjacart</strong></p>
          </div>
          <RecoveryVisual/>
        </div>
        <div className="lp-container lp-hero-strip"><span><Icon name="briefcase"/> Banks, NBFCs & fintechs</span><span><Icon name="shield"/> Pan-India execution</span><span><Icon name="cases"/> End-to-end legal visibility</span></div>
      </section>

      <section id="services" className="lp-section lp-services" aria-labelledby="services-title">
        <div className="lp-container lp-services-grid">
          <div className="lp-section-intro"><p className="lp-eyebrow">01 / WHAT WE DO</p><h2 id="services-title">A focused response to difficult recoveries.</h2><p>Deep-default portfolios need a coordinated approach. Lawcovery connects the legal process with the people and information needed to move it forward.</p><a className="lp-inline-link" href="#process">How our approach works <Icon name="arrow" size={18}/></a></div>
          <div className="lp-service-list">{services.map(([icon, title, description], i) => <article key={title}><div className="lp-service-icon"><Icon name={icon} size={24}/></div><div><span className="lp-small-index">0{i + 1}</span><h3>{title}</h3><p>{description}</p></div></article>)}</div>
        </div>
      </section>

      <section id="results" className="lp-section lp-results" aria-labelledby="results-title">
        <div className="lp-container">
          <div className="lp-section-heading"><div><p className="lp-eyebrow">02 / OUR TRACK RECORD</p><h2 id="results-title">Recovery is the goal.<br/>Execution makes the difference.</h2></div><p>A specialist focus on hard-to-recover portfolios, supported by integrated legal and recovery teams.</p></div>
          <div className="lp-results-grid">
            <div className="lp-primary-result"><span className="lp-result-label">REPORTED PORTFOLIO PERFORMANCE</span><strong>50%<span>+</span></strong><h3>Recovery clearance rate</h3><p>As reported in Lawcovery’s company profile for hard-to-recover portfolios.</p></div>
            <dl className="lp-result-facts"><div><dt>90+ DPD</dt><dd>Specialised focus on deep-default portfolios.</dd></div><div><dt>Pan-India</dt><dd>Execution across urban and rural jurisdictions.</dd></div><div><dt>End-to-end</dt><dd>Visibility throughout the legal recovery process.</dd></div><div><dt>Integrated</dt><dd>Legal and recovery teams working together.</dd></div></dl>
          </div>
          <p className="lp-result-note">Recovery outcomes depend on the portfolio and case circumstances. The reported rate is historical performance, not a guarantee for an individual account or a new portfolio.</p>
        </div>
      </section>

      <section id="process" className="lp-section lp-process" aria-labelledby="process-title"><div className="lp-container">
        <p className="lp-eyebrow">03 / THE RECOVERY APPROACH</p><div className="lp-section-heading"><h2 id="process-title">From portfolio context<br/>to visible progress.</h2><p>A coordinated approach that keeps legal action, execution and your team connected.</p></div>
        <ol className="lp-steps">{steps.map(([title, description], i) => <li key={title}><span className="lp-step-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
      </div></section>

      <section id="partners" className="lp-section lp-partners" aria-labelledby="partners-title"><div className="lp-container">
        <p className="lp-eyebrow">04 / OUR LENDING ECOSYSTEM</p><div className="lp-section-heading"><h2 id="partners-title">Built for lending partners.</h2><p>Specialised recovery support for the institutions and platforms that power credit.</p></div>
        <div className="lp-partner-layout"><aside className="lp-ninjacart"><span>A recovery arm of</span><strong>ninjacart<span>.</span></strong><p>Legal recovery expertise, connected to the broader lending ecosystem.</p><Icon name="connection" size={38}/></aside>
          <div className="lp-partner-detail"><div className="lp-partner-options" role="group" aria-label="Choose your institution type">{partners.map((item, i) => <button type="button" key={item.name} aria-pressed={partner === i} onClick={() => setPartner(i)}>{item.name}</button>)}</div>
            <div className="lp-partner-copy" aria-live="polite" aria-atomic="true"><span className="lp-partner-focus">{current.focus}</span><h3>{current.title}</h3><p>{current.description}</p><ul>{current.tags.map(tag => <li key={tag}><Icon name="check" size={16}/>{tag}</li>)}</ul></div>
          </div>
        </div>
      </div></section>

      <section className="lp-section lp-faq" aria-labelledby="faq-title"><div className="lp-container lp-faq-grid"><div><p className="lp-eyebrow">A LITTLE MORE CLARITY</p><h2 id="faq-title">Before we work together.</h2></div><div>
        <details><summary>Which portfolios does Lawcovery focus on?</summary><p>We specialise in hard-to-recover 90+ DPD portfolios, including retail and commercial NPAs, secured and unsecured books, and digital loan defaults.</p></details>
        <details><summary>How can our team follow legal progress?</summary><p>The client workspace brings together saved case details, current stages, hearing dates and a separate history of case updates. Access is provided through your company workspace.</p></details>
        <details><summary>Is the reported recovery rate a guaranteed outcome?</summary><p>No. The reported figure describes Lawcovery’s historical portfolio performance. Each portfolio and case has its own circumstances, so a new portfolio or individual account can have a different outcome.</p></details>
      </div></div></section>

      <section className="lp-closing" aria-labelledby="closing-title"><div className="lp-container lp-closing-inner"><div><p className="lp-eyebrow">FOCUSED ON RECOVERY. BUILT AROUND CLARITY.</p><h2 id="closing-title">Make the next step<br/>a clearer one.</h2><p>Explore our approach to legal recovery. Existing clients can sign in to see their company’s portfolio.</p></div><div className="lp-closing-actions"><a className="lp-button lp-button-accent" href="?view=login">Open client workspace <Icon name="arrow" size={18}/></a><a className="lp-text-link" href="#services">Explore our services <span aria-hidden="true">↑</span></a><small>For a portfolio discussion, connect with your Lawcovery relationship manager.</small></div></div></section>
    </main>
    <footer className="lp-footer"><a className="brand lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo/></a><p>Legal recovery. A clearer perspective.</p><span>© {new Date().getFullYear()} Lawcovery</span><a href="?view=login">Client login <Icon name="arrow" size={16}/></a></footer>
  </div>;
}
