import React, { useEffect, useState } from "react";
import recoveryPanorama from "../assets/loan-recovery-panorama.webp";
import { LawcoveryLogo } from "./LawcoveryLogo";
import { RecoveryScene } from "./RecoveryScene";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";
import "../public-site.css";

const services = [
  {
    icon: "briefcase",
    title: "Portfolio-led recovery",
    description: "We bring the records and recovery history together for accounts that are 90 or more days past due.",
  },
  {
    icon: "shield",
    title: "Pan-India execution",
    description: "Legal teams coordinate on-ground warrant execution across urban and rural jurisdictions.",
  },
  {
    icon: "cases",
    title: "Visibility into every case",
    description: "Your company workspace brings court updates, hearings, and case history into one view.",
  },
];

const partners = [
  {
    name: "Commercial banks",
    portfolio: "Retail and commercial NPAs",
    crop: "intake",
    title: "A focused approach to retail and commercial NPAs.",
    description: "Bring difficult overdue portfolios into a structured legal recovery workflow, with coordinated execution and visibility over case progress.",
  },
  {
    name: "NBFCs",
    portfolio: "Secured and unsecured books",
    crop: "review",
    title: "Recovery for secured and unsecured books.",
    description: "Connect legal strategy and recovery execution for deep-default accounts, with visibility into the progress of each case.",
  },
  {
    name: "LSPs & fintechs",
    portfolio: "Digital loan defaults",
    crop: "recovery",
    title: "A legal recovery path for digital loan defaults.",
    description: "Support overdue digital lending portfolios with an integrated legal and recovery approach, backed by shared case visibility.",
  },
];

const journey = [
  {
    id: "portfolio-intake",
    crop: "intake",
    label: "Portfolio intake",
    frame: 47,
    title: "Start with the overdue account.",
    description: "Bring together the records and recovery history for accounts that are 90 or more days past due.",
  },
  {
    id: "legal-review",
    crop: "review",
    label: "Legal review",
    frame: 76,
    title: "Build a plan for legal action.",
    description: "Legal and recovery teams assess the case, decide the next step, and coordinate on-ground work in the relevant jurisdiction.",
  },
  {
    id: "recovery",
    crop: "recovery",
    label: "Recovery tracking",
    frame: 160,
    title: "See how each case progresses.",
    description: "Follow court updates, hearings, and recorded recovery outcomes so your team knows which cases need attention.",
  },
];

function RecoveryCrop({ crop }) {
  return (
    <span className="lp-art-crop" data-crop={crop}>
      <img src={recoveryPanorama} alt="" width={1983} height={793} loading="lazy" decoding="async"/>
    </span>
  );
}

function LandingHero() {
  return (
    <section className="lp-hero" aria-labelledby="public-title">
      <div className="lp-shell lp-hero-inner">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">Legal recovery for 90+ DPD portfolios</p>
          <h1 id="public-title">Overdue portfolios.<br/><em>A clear way forward.</em></h1>
          <p className="lp-lede">Lawcovery brings legal action, on-ground execution, and case tracking together for overdue loan portfolios.</p>
          <div className="lp-actions">
            <a className="lp-button" href="#process">See how it works <Icon name="arrow" size={18}/></a>
            <a className="lp-text-link" href="#services">Explore our services <Icon name="arrow" size={16}/></a>
          </div>
          <p className="lp-affiliation">A recovery arm of <strong>ninjacart</strong></p>
        </div>
        <figure className="lp-hero-artwork">
          <img
            src={recoveryPanorama}
            alt="The Lawcovery recovery centre with overdue loan files, legal scales, and checked recovery folders."
            width={1983}
            height={793}
            fetchPriority="high"
          />
        </figure>
        <nav className="lp-hero-previews" aria-label="Preview the recovery stages">
          {journey.map(({ id, label, crop }) => (
            <a key={id} href={"#" + id}>
              <RecoveryCrop crop={crop}/>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="services" className="lp-section lp-capabilities lp-dark" aria-labelledby="services-title">
      <div className="lp-shell">
        <div className="lp-section-heading lp-centred">
          <h2 id="services-title">Why Lawcovery?</h2>
          <p>Legal strategy, field execution, and case tracking in one workflow.</p>
        </div>
        <div className="lp-drawers">
          {services.map(({ icon, title, description }, index) => (
            <details className="lp-drawer" key={title} name="lawcovery-capabilities" open={index === 0}>
              <summary>
                <span className="lp-drawer-icon"><Icon name={icon} size={23}/></span>
                <span>{title}</span>
                <span className="lp-drawer-handle" aria-hidden="true"/>
              </summary>
              <p>{description}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function LendingPartners() {
  const [selected, setSelected] = useState(0);
  const partner = partners[selected];

  return (
    <section id="partners" className="lp-section lp-partners" aria-labelledby="partners-title">
      <div className="lp-shell">
        <div className="lp-section-heading">
          <p className="lp-eyebrow">Lending partners</p>
          <h2 id="partners-title">Built for the teams behind the loan.</h2>
        </div>
        <div className="lp-partner-options" role="group" aria-label="Choose your institution type">
          {partners.map((item, index) => (
            <button type="button" className="lp-partner-card" key={item.name} aria-pressed={selected === index} aria-controls="lp-partner-details" onClick={() => setSelected(index)}>
              <RecoveryCrop crop={item.crop}/>
              <span className="lp-partner-card-copy">
                <span><strong>{item.name}</strong><small>{item.portfolio}</small></span>
                <Icon name="arrow" size={18}/>
              </span>
            </button>
          ))}
        </div>
        <div className="lp-partner-copy" id="lp-partner-details" aria-live="polite" aria-atomic="true">
          <h3>{partner.title}</h3>
          <p>{partner.description}</p>
        </div>
      </div>
    </section>
  );
}

function RecoveryWorkflow() {
  return (
    <section id="process" className="lp-workflow lp-dark" aria-labelledby="process-title">
      <div className="lp-shell lp-workflow-intro">
        <p className="lp-eyebrow">How it works</p>
        <h2 id="process-title">From overdue account<br/>to tracked recovery.</h2>
        <p>Follow an illustrative account through the recovery process.</p>
      </div>
      <div className="lp-workflow-timeline">
        <RecoveryScene chapters={journey}/>
        <div className="lp-film-chapters lp-shell">
          <p className="lp-film-cue"><Icon name="arrow" size={16}/> Scroll to follow the account card</p>
          {journey.map(({ id, label, title, description, frame }) => (
            <section id={id} className="lp-film-chapter" aria-labelledby={id + "-title"} data-recovery-frame={frame} key={id}>
              <div>
                <p className="lp-eyebrow">{label}</p>
                <h3 id={id + "-title"}>{title}</h3>
                <p>{description}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PublicLanding() {
  useEffect(() => {
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="public-site">
      <a className="lp-skip" href="#public-content">Skip to content</a>
      <header className="lp-header">
        <div className="lp-shell lp-header-inner">
          <a className="brand lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo/></a>
          <nav className="lp-nav" aria-label="Main navigation">
            <a href="#services">What we do</a>
            <a href="#partners">Partners</a>
            <a href="#process">How it works</a>
            <a href="#results">Results</a>
          </nav>
          <a className="lp-login" href="?view=login">Client login <Icon name="arrow" size={16}/></a>
        </div>
      </header>

      <main id="public-content" tabIndex={-1}>
        <LandingHero/>
        <Capabilities/>
        <LendingPartners/>
        <RecoveryWorkflow/>

        <section id="results" className="lp-section lp-results" aria-labelledby="results-title">
          <div className="lp-shell lp-results-layout">
            <div className="lp-results-copy">
              <p className="lp-eyebrow">Our track record</p>
              <h2 id="results-title">Recovery performance.</h2>
              <p>Focused on hard-to-recover portfolios, with legal execution and case tracking in one workflow.</p>
            </div>
            <div className="lp-result-card">
              <strong>50%<span>+</span></strong>
              <h3>Reported recovery clearance rate</h3>
              <p>As reported in Lawcovery’s company profile for hard-to-recover portfolios. This figure reflects historical portfolio performance. Outcomes vary by portfolio and case.</p>
            </div>
          </div>
        </section>

        <section className="lp-section lp-faq" aria-labelledby="faq-title">
          <div className="lp-shell lp-faq-layout">
            <h2 id="faq-title">Before we work together.</h2>
            <div className="lp-questions">
              <details>
                <summary>Which portfolios does Lawcovery focus on?</summary>
                <p>We specialise in 90+ DPD portfolios, including retail and commercial NPAs, secured and unsecured books, and digital loan defaults.</p>
              </details>
              <details>
                <summary>How can our team follow legal progress?</summary>
                <p>The client workspace brings together saved case details, current stages, hearing dates, and a history of case updates.</p>
              </details>
              <details>
                <summary>Does the reported recovery rate apply to every portfolio?</summary>
                <p>The figure describes historical portfolio performance. A new portfolio or individual account can have a different outcome.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="lp-closing lp-dark" aria-labelledby="closing-title">
          <img src={recoveryPanorama} alt="" width={1983} height={793} loading="lazy" decoding="async"/>
          <div className="lp-shell">
            <div className="lp-closing-copy">
              <h2 id="closing-title">Ready to review your portfolio?</h2>
              <p>Sign in to see your company’s cases. For a portfolio discussion, contact your Lawcovery relationship manager.</p>
              <div className="lp-actions lp-closing-actions">
                <a className="lp-button" href="?view=login">Open client workspace <Icon name="arrow" size={18}/></a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-dark">
        <div className="lp-shell lp-footer-inner">
          <a className="brand lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo/></a>
          <span>© {new Date().getFullYear()} Lawcovery</span>
          <a href="?view=login">Client login <Icon name="arrow" size={16}/></a>
        </div>
      </footer>
    </div>
  );
}
