import React, { useEffect, useRef, useState } from "react";
import { LawcoveryLogo } from "./LawcoveryLogo";
import { CaseStack3D } from "./CaseStack3D";
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
    icon: "briefcase",
    portfolio: "Retail and commercial NPAs",
    title: "A focused approach to retail and commercial NPAs.",
    description: "Bring difficult overdue portfolios into a structured legal recovery workflow, with coordinated execution and visibility over case progress.",
  },
  {
    name: "NBFCs",
    icon: "shield",
    portfolio: "Secured and unsecured books",
    title: "Recovery for secured and unsecured books.",
    description: "Connect legal strategy and recovery execution for deep-default accounts, with visibility into the progress of each case.",
  },
  {
    name: "LSPs & fintechs",
    icon: "connection",
    portfolio: "Digital loan defaults",
    title: "A legal recovery path for digital loan defaults.",
    description: "Support overdue digital lending portfolios with an integrated legal and recovery approach, backed by shared case visibility.",
  },
];

const journey = [
  {
    id: "portfolio-intake",
    icon: "briefcase",
    label: "Portfolio intake",
    title: "Start with the overdue account.",
    description: "Bring together the records and recovery history for accounts that are 90 or more days past due.",
    points: ["Account records", "Recovery history", "90+ DPD focus"],
  },
  {
    id: "legal-review",
    icon: "shield",
    label: "Legal review",
    title: "Build a plan for legal action.",
    description: "Legal and recovery teams assess the case, decide the next step, and coordinate on-ground work in the relevant jurisdiction.",
    points: ["Case assessment", "Next legal step", "On-ground coordination"],
  },
  {
    id: "recovery",
    icon: "check",
    label: "Recovery tracking",
    title: "See how each case progresses.",
    description: "Follow court updates, hearings, and recorded recovery outcomes so your team knows which cases need attention.",
    points: ["Court updates", "Hearing dates", "Recovery outcomes"],
  },
];

const clamp = (value) => Math.min(1, Math.max(0, value));

// One scroll listener drives every animated section through CSS variables:
//   data-scroll="track"  - a tall section with a sticky stage; --p runs 0 -> 1
//                          while the stage is pinned.
//   data-scroll="reveal" - an element easing into place; --p runs 0 -> 1 as it
//                          enters the viewport.
// Decks inside a track also get --d / --ad (signed / absolute distance from
// the active card) so each card can be placed in 3D space by CSS.
function useScrollScenes(root) {
  useEffect(() => {
    const host = root.current;
    if (!host || typeof window.requestAnimationFrame !== "function") return undefined;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scenes = [...host.querySelectorAll("[data-scroll]")];
    if (reduce) {
      scenes.forEach((el) => el.style.setProperty("--p", el.dataset.scroll === "reveal" ? "1" : "0.5"));
      return undefined;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight || 1;
      for (const el of scenes) {
        const rect = el.getBoundingClientRect();
        const p = el.dataset.scroll === "track"
          ? clamp(-rect.top / Math.max(1, rect.height - vh))
          : clamp((vh - rect.top) / (vh * 0.7));
        el.style.setProperty("--p", p.toFixed(4));
        const cards = el.querySelectorAll("[data-deck-card]");
        if (cards.length) {
          const position = p * (cards.length - 1);
          const active = Math.round(position);
          cards.forEach((card, i) => {
            const d = i - position;
            card.style.setProperty("--d", d.toFixed(4));
            card.style.setProperty("--ad", Math.abs(d).toFixed(4));
            card.style.setProperty("--past", Math.max(0, -d).toFixed(4));
            card.style.setProperty("--next", Math.max(0, d).toFixed(4));
            // The outgoing card stays above the one taking its place; upcoming cards sit below.
            card.style.zIndex = String(d < -0.02 ? 30 + Math.round(d * 3) : 20 - Math.round(d * 3));
            card.toggleAttribute("data-active", i === active);
          });
          el.querySelectorAll("[data-deck-step]").forEach((step, i) => step.toggleAttribute("data-active", i === active));
        }
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root]);
}

function Hero() {
  return (
    <section className="lp-hero" data-scroll="track" aria-labelledby="public-title">
      <div className="lp-hero-sticky">
        <div className="lp-shell lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow"><span className="lp-pulse" />Legal recovery for 90+ DPD portfolios</p>
            <h1 id="public-title">Overdue portfolios.<br /><em>A clear way forward.</em></h1>
            <p className="lp-lede">Lawcovery brings legal action, on-ground execution, and case tracking together for overdue loan portfolios.</p>
            <div className="lp-actions">
              <a className="lp-button" href="#process">See how it works <Icon name="arrow" size={18} /></a>
              <a className="lp-text-link" href="#services">Explore our services <Icon name="arrow" size={16} /></a>
            </div>
            <p className="lp-affiliation">Recovery arm of <strong>ninjacart</strong></p>
          </div>
          <div className="lp-hero-visual">
            <CaseStack3D />
          </div>
        </div>
        <p className="lp-scroll-cue" aria-hidden="true"><span />Scroll</p>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="services" className="lp-section" aria-labelledby="services-title">
      <div className="lp-shell">
        <div className="lp-section-heading lp-centred">
          <p className="lp-eyebrow">What we do</p>
          <h2 id="services-title">Why Lawcovery?</h2>
          <p>Legal strategy, field execution, and case tracking in one workflow.</p>
        </div>
        <div className="lp-service-grid">
          {services.map(({ icon, title, description }, index) => (
            <article className="lp-service" data-scroll="reveal" style={{ "--delay": index }} key={title}>
              <span className="lp-service-icon"><Icon name={icon} size={24} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
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
      <div className="lp-shell lp-partner-layout">
        <div>
          <div className="lp-section-heading">
            <p className="lp-eyebrow">Lending partners</p>
            <h2 id="partners-title">Built for the teams behind the loan.</h2>
          </div>
          <div className="lp-partner-options" role="group" aria-label="Choose your institution type">
            {partners.map((item, index) => (
              <button
                type="button"
                className="lp-partner-card"
                key={item.name}
                aria-pressed={selected === index}
                aria-controls="lp-partner-details"
                onClick={() => setSelected(index)}
              >
                <span className="lp-partner-icon"><Icon name={item.icon} size={20} /></span>
                <span className="lp-partner-card-copy">
                  <strong>{item.name}</strong>
                  <small>{item.portfolio}</small>
                </span>
                <Icon name="arrow" size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="lp-partner-stage" data-scroll="reveal">
          <div className="lp-partner-copy" id="lp-partner-details" aria-live="polite" aria-atomic="true" key={selected}>
            <span className="lp-partner-badge"><Icon name={partner.icon} size={18} />{partner.portfolio}</span>
            <h3>{partner.title}</h3>
            <p>{partner.description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecoveryWorkflow() {
  return (
    <section id="process" className="lp-process" data-scroll="track" aria-labelledby="process-title">
      {journey.map(({ id }, index) => (
        <span key={id} id={id} className="lp-process-anchor" style={{ "--at": index / (journey.length - 1) }} />
      ))}
      <div className="lp-process-sticky">
        <div className="lp-shell lp-process-grid">
          <div className="lp-process-copy">
            <p className="lp-eyebrow">How it works</p>
            <h2 id="process-title">From overdue account<br />to tracked recovery.</h2>
            <ol className="lp-process-steps">
              {journey.map(({ id, label, title, description }, index) => (
                <li key={id} data-deck-step data-active={index === 0 ? "" : undefined}>
                  <span className="lp-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{label}</strong>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lp-process-rail" aria-hidden="true"><i /></div>
          </div>
          <div className="lp-deck" aria-hidden="true">
            {journey.map(({ id, icon, label, points }, index) => (
              <div className="lp-deck-card" data-deck-card key={id} style={{ "--d": index, "--ad": index, "--past": 0, "--next": index }}>
                <div className="lp-deck-head">
                  <span className="lp-service-icon"><Icon name={icon} size={22} /></span>
                  <span>Step {index + 1} of {journey.length}</span>
                </div>
                <strong>{label}</strong>
                <ul>
                  {points.map((point) => <li key={point}><Icon name="check" size={15} />{point}</li>)}
                </ul>
                <span className="lp-deck-bar"><i style={{ inlineSize: `${((index + 1) / journey.length) * 100}%` }} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Results() {
  return (
    <section id="results" className="lp-section lp-results" aria-labelledby="results-title">
      <div className="lp-shell lp-results-layout">
        <div className="lp-results-copy">
          <p className="lp-eyebrow">Our track record</p>
          <h2 id="results-title">Recovery performance.</h2>
          <p>Focused on hard-to-recover portfolios, with legal execution and case tracking in one workflow.</p>
        </div>
        <div className="lp-result-card" data-scroll="reveal">
          <div className="lp-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" /><circle className="lp-ring-fill" cx="60" cy="60" r="52" pathLength="100" /></svg></div>
          <div>
            <strong>50%<span>+</span></strong>
            <h3>Reported recovery clearance rate</h3>
            <p>As reported in Lawcovery’s company profile for hard-to-recover portfolios. This figure reflects historical portfolio performance. Outcomes vary by portfolio and case.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Slow, continuous auto-scroll for the homepage so the scroll story plays by
// itself. Any manual input (wheel, touch, keys, click, scrollbar drag) hands
// control to the visitor; it resumes from there after a few idle seconds. At
// the bottom it holds, glides back to the top and starts again.
const AUTO_SCROLL = { speed: 110, startDelay: 1000, resumeAfter: 5000, holdAtEnd: 4000 }; // px/s, ms
function useAutoScroll() {
  useEffect(() => {
    if (typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0, last = 0, pos = window.scrollY, pausedUntil = performance.now() + AUTO_SCROLL.startDelay;
    let expected = window.scrollY, gliding = false, holdTimer = 0;
    const jump = (y) => { expected = Math.round(y); window.scrollTo({ top: y, behavior: "instant" }); };
    const pause = () => { pausedUntil = performance.now() + AUTO_SCROLL.resumeAfter; gliding = false; clearTimeout(holdTimer); };
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      if (document.hidden || gliding || now < pausedUntil) { pos = window.scrollY; return; }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (pos >= max - 1) {
        // Hold at the end, then glide back to the top and start over.
        gliding = true;
        holdTimer = setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          holdTimer = setTimeout(() => { gliding = false; pos = window.scrollY; pausedUntil = performance.now() + AUTO_SCROLL.startDelay; }, 2500);
        }, AUTO_SCROLL.holdAtEnd);
        return;
      }
      pos = Math.min(max, pos + (AUTO_SCROLL.speed * dt) / 1000);
      jump(pos);
    };
    // A scroll we did not cause (scrollbar drag, find-in-page, links) is manual.
    const onScroll = () => { if (!gliding && Math.abs(window.scrollY - expected) > 2) pause(); };
    const inputs = ["wheel", "touchstart", "touchmove", "keydown", "mousedown"];
    inputs.forEach((type) => window.addEventListener(type, pause, { passive: true }));
    window.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(holdTimer);
      inputs.forEach((type) => window.removeEventListener(type, pause));
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
}

export function PublicLanding() {
  const root = useRef(null);
  useScrollScenes(root);
  useAutoScroll();
  useEffect(() => {
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="public-site" ref={root}>
      <a className="lp-skip" href="#public-content">Skip to content</a>
      <header className="lp-header">
        <div className="lp-shell lp-header-inner">
          <a className="lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo /></a>
          <nav className="lp-nav" aria-label="Main navigation">
            <a href="#services">What we do</a>
            <a href="#partners">Partners</a>
            <a href="#process">How it works</a>
            <a href="#results">Results</a>
          </nav>
          <a className="lp-login" href="?view=login">Client login <Icon name="arrow" size={16} /></a>
        </div>
      </header>

      <main id="public-content" tabIndex={-1}>
        <Hero />
        <Capabilities />
        <RecoveryWorkflow />
        <LendingPartners />
        <Results />

        <section className="lp-section lp-faq" aria-labelledby="faq-title">
          <div className="lp-shell lp-faq-layout">
            <div className="lp-section-heading">
              <p className="lp-eyebrow">FAQ</p>
              <h2 id="faq-title">Before we work together.</h2>
            </div>
            <div className="lp-questions">
              <details open>
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

        <section className="lp-closing" aria-labelledby="closing-title">
          <div className="lp-shell">
            <div className="lp-closing-card" data-scroll="reveal">
              <div className="lp-closing-copy">
                <h2 id="closing-title">Ready to review your portfolio?</h2>
                <p>Sign in to see your company’s cases. For a portfolio discussion, contact your Lawcovery relationship manager.</p>
                <div className="lp-actions lp-closing-actions">
                  <a className="lp-button is-light" href="?view=login">Open client workspace <Icon name="arrow" size={18} /></a>
                </div>
              </div>
              <div className="lp-closing-visual"><CaseStack3D idle /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <a className="lp-brand" href="?view=home" aria-label="Lawcovery home"><LawcoveryLogo /></a>
          <span>© {new Date().getFullYear()} Lawcovery · Legal recovery for overdue portfolios</span>
          <a href="?view=login">Client login <Icon name="arrow" size={16} /></a>
        </div>
      </footer>
    </div>
  );
}
