import React, { useEffect, useState } from "react";

// Rotating brand strip for the middle of the workspace header:
// Lawcovery mark → "A Legal Recovery Company" → "Recovery arm of" Ninjacart.
const SLIDES = [
  { key: "mark", content: <img className="bt-mark" src="/lawcovery-mark.svg" alt="Lawcovery" /> },
  { key: "tagline", content: <span className="bt-text">A Legal Recovery Company</span> },
  {
    key: "ninjacart",
    content: (
      <span className="bt-arm">
        <span className="bt-text">Recovery arm of</span>
        <img className="bt-ninjacart" src="/ninjacart-logo.png" alt="Ninjacart" />
      </span>
    ),
  },
];
const HOLD_MS = 3200;

export function BrandTicker() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), HOLD_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="brand-ticker" aria-label="Lawcovery, a legal recovery company, recovery arm of Ninjacart">
      {SLIDES.map((slide, i) => (
        <div
          key={slide.key}
          className={`bt-slide ${i === index ? "is-on" : i === (index + SLIDES.length - 1) % SLIDES.length ? "is-off" : ""}`}
          aria-hidden={i !== index}
        >
          {slide.content}
        </div>
      ))}
    </div>
  );
}
