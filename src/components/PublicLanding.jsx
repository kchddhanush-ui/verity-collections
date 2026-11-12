import React, { useEffect, useState } from "react";
import recoveryCentre from "../assets/loan-recovery-centre.webp";
import { LawcoveryLogo } from "./LawcoveryLogo";
import { WorkspaceIcon as Icon } from "./WorkspaceIcon";
import "../public-site.css";

const services = [
  ["briefcase", "Portfolio-led legal recovery", "A coordinated approach for hard-to-recover accounts that are 90 or more days past due."],
  ["shield", "Pan-India execution", "Legal teams coordinate on-ground warrant execution across urban and rural jurisdictions."],
  ["cases", "Case visibility", "Follow court updates, hearings, and case history from your company workspace."],
];

const partners = [
  {
    name: "Commercial banks",
    title: "A focused approach to retail and commercial NPAs.",
    description: "Bring difficult overdue portfolios into a structured legal recovery workflow, with coordinated execution and visibility over case progress.",
  },
  {
    name: "NBFCs",
    title: "Recovery for secured and unsecured books.",
    description: "Connect legal strategy and recovery execution for deep-default accounts, with visibility into the progress of each case.",
  },
  {
    name: "LSPs & fintechs",
    title: "A legal recovery path for digital loan defaults.",
    description: "Support overdue digital lending portfolios with an integrated legal and recovery approach, backed by shared case visibility.",
  },
];

const journey = [
  {
    id: "process",
    label: "Portfolio intake",
    title: "Start with the overdue account.",
    description: "Bring together the records and recovery history for accounts that are 90 or more days past due. Give the teams handling the portfolio a shared view of each case.",
  },
  {
    id: "legal-review",
    label: "Legal review",
    title: "Build a plan for legal action.",
    description: "Legal and recovery teams assess the case, decide the next step, and coordinate on-ground work in the relevant jurisdiction.",
  },
  {
    id: "recovery",
    label: "Recovery tracking",
    title: "See how each case progresses.",
    description: "Follow court updates, hearings, and recorded recovery outcomes so your team knows which cases need attention.",
  },
];

function RecoveryScene() {
  return (
    <figure className="lp-stage">
      <div className="lp-stage-inner">
        <div className="lp-scene">
          <img
            className="lp-scene-art"
            src={recoveryCentre}
            alt="Illustrated recovery centre with overdue loan files, legal scales, and checked recovery folders."
            width={1983}
            height={793}
            fetchPriority="high"
          />
        </div>
        <figcaption>
          <nav className="lp-stage-nav" aria-label="Recovery stages">
            {journey.map(({ id, label }) => <a key={id} href={"#" + id}>{label}</a>)}
          </nav>
          <div className="lp-stage-progress" aria-hidden="true"><span/></div>
        </figcaption>
      </div>
    </figure>
  );
}

function LendingPartners() {
  const [selected, setSelected] = useState(0);
  const partner = partners[selected];

  return (
    <section id="partners" className="lp-panel lp-partners" aria-labelledby="partners-title">
      <div className="lp-panel-inner">
        <p className="lp-eyebrow">Lending partners</p>
        <h2 id="partners-title">Built for the teams behind the loan.</h2>
        <div className="lp-partner-options" role="group" aria-label="Choose your institution type">
          {partners.map((item, index) => (
            <button type="button" key={item.name} aria-pressed={selected === index} onClick={() => setSelected(index)}>
              {item.name}
            </button>
          ))}
        </div>
        <div className="lp-partner-copy" aria-live="polite" aria-atomic="true">
          <h3>{partner.title}</h3>
          <p>{partner.description}</p>
        </div>
        <p className="lp-affiliation">A recovery arm of <strong>ninjacart</strong></p>
      </div>
    </section>
  );
}

export function PublicLanding() {
  useEffect(() => {
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="public-site">
      <a className="lp-skip" href="#public-content">Skip to content</a>
      <header className="lp-header">
        <div className="lp-header-inner">
          <a className="brand lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo/></a>
          <nav className="lp-nav" aria-label="Main navigation">
            <a href="#process">How it works</a>
            <a href="#results">Our results</a>
            <a href="#partners">Partners</a>
            <a className="lp-login" href="?view=login">Client login <Icon name="arrow" size={16}/></a>
          </nav>
        </div>
      </header>

      <main id="public-content" tabIndex={-1} className="lp-experience">
        <section className="lp-panel lp-hero" aria-labelledby="public-title">
          <div className="lp-panel-inner">
            <p className="lp-eyebrow">Legal recovery for 90+ DPD portfolios</p>
            <h1 id="public-title">Overdue portfolios.<br/><em>A clear way forward.</em></h1>
            <p className="lp-lede">Lawcovery brings legal action, on-ground execution, and case tracking together for overdue loan portfolios.</p>
            <div className="lp-actions">
              <a className="lp-button" href="#process">See how it works <Icon name="arrow" size={18}/></a>
              <a className="lp-text-link" href="#results">See our track record <Icon name="external" size={15}/></a>
            </div>
            <p className="lp-affiliation">A recovery arm of <strong>ninjacart</strong></p>
          </div>
        </section>

        <RecoveryScene/>

        <div className="lp-chapters">
          {journey.map(({ id, label, title, description }) => (
            <section id={id} className="lp-panel lp-chapter" aria-labelledby={id + "-title"} key={id}>
              <div className="lp-panel-inner">
                <p className="lp-eyebrow">{label}</p>
                <h2 id={id + "-title"}>{title}</h2>
                <p className="lp-lede">{description}</p>
              </div>
            </section>
          ))}

          <div className="lp-after-recovery">
            <section id="services" className="lp-panel lp-services" aria-labelledby="services-title">
              <div className="lp-panel-inner">
                <p className="lp-eyebrow">What we do</p>
                <h2 id="services-title">A coordinated approach to difficult recoveries.</h2>
                <div className="lp-service-list">
                  {services.map(([icon, title, description]) => (
                    <article key={title}>
                      <span className="lp-service-icon"><Icon name={icon} size={20}/></span>
                      <div><h3>{title}</h3><p>{description}</p></div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section id="results" className="lp-panel lp-results" aria-labelledby="results-title">
              <div className="lp-panel-inner">
                <p className="lp-eyebrow">Our track record</p>
                <h2 id="results-title">Recovery performance</h2>
                <div className="lp-primary-result">
                  <strong>50%<span>+</span></strong>
                  <h3>Reported recovery clearance rate</h3>
                  <p>As reported in Lawcovery’s company profile for hard-to-recover portfolios.</p>
                </div>
                <p className="lp-result-note">This figure reflects historical portfolio performance. Outcomes vary by portfolio and case.</p>
              </div>
            </section>

            <LendingPartners/>

            <section className="lp-panel lp-faq" aria-labelledby="faq-title">
              <div className="lp-panel-inner">
                <p className="lp-eyebrow">Frequently asked questions</p>
                <h2 id="faq-title">Before we work together</h2>
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

            <section className="lp-panel lp-closing" aria-labelledby="closing-title">
              <div className="lp-panel-inner">
                <h2 id="closing-title">Ready to review your portfolio?</h2>
                <p className="lp-lede">Sign in to see your company’s cases. For a portfolio discussion, contact your Lawcovery relationship manager.</p>
                <div className="lp-actions">
                  <a className="lp-button" href="?view=login">Open client workspace <Icon name="arrow" size={18}/></a>
                  <a className="lp-text-link" href="#services">Explore our services <span aria-hidden="true">↑</span></a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="lp-footer">
        <a className="brand lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo/></a>
        <span>© {new Date().getFullYear()} Lawcovery</span>
        <a href="?view=login">Client login <Icon name="arrow" size={16}/></a>
      </footer>
    </div>
  );
}
