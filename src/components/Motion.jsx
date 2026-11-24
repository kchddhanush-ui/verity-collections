import React, { useEffect, useRef, useState } from "react";

// Shared, opt-out-able motion for the workspace. Everything here is skipped
// when the viewer prefers reduced motion or the browser lacks the APIs
// (e.g. the test DOM), so content is always shown in its final state.
const canAnimate = () =>
  typeof window !== "undefined" &&
  typeof window.requestAnimationFrame === "function" &&
  typeof window.matchMedia === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts from the previous value to `value` (ease-out, ~0.8s) and renders it
 * through `format`. Screen readers get the final value only.
 */
export function CountUp({ value, format = String, duration = 800 }) {
  const valid = typeof value === "number" && Number.isFinite(value);
  const [shown, setShown] = useState(() => (valid && canAnimate() ? 0 : value));
  const from = useRef(valid && canAnimate() ? 0 : value);
  useEffect(() => {
    if (!valid || !canAnimate()) { setShown(value); from.current = value; return undefined; }
    const start = performance.now();
    const origin = typeof from.current === "number" && Number.isFinite(from.current) ? from.current : 0;
    let frame = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = window.requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); from.current = value; };
  }, [value, valid, duration]);
  if (!valid) return <>{format(value)}</>;
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="visually-hidden">{format(value)}</span>
    </>
  );
}

// Blocks that rise into place as they scroll into view. Kept to top-level
// blocks so nested cards do not animate twice.
const REVEAL_SELECTOR = [
  "main > :not(.analytics-dashboard):not(dialog):not([role='dialog'])",
  ".analytics-dashboard > :not(.analytics-metrics):not(.analytics-grid)",
  ".analytics-metrics > *",
  ".analytics-grid > *",
  ".stage-cards > *",
  ".hc-agenda-list > *",
  ".connections-grid > *",
].join(",");

/**
 * Marks blocks inside `root` as data-reveal="pending" and flips them to "in"
 * when they enter the viewport. Blocks that enter together are staggered.
 * Re-scans when the page content changes (navigation, filters, loading).
 */
export function useScrollReveal(root, deps = []) {
  useEffect(() => {
    const host = root.current;
    if (!host || !canAnimate() || typeof window.IntersectionObserver !== "function") return undefined;
    const observer = new IntersectionObserver((entries) => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.style.setProperty("--reveal-i", String(Math.min(order++, 6)));
        entry.target.dataset.reveal = "in";
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    const scan = () => {
      host.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
        if (el.dataset.reveal) return;
        el.dataset.reveal = "pending";
        observer.observe(el);
      });
    };
    scan();
    const mutations = typeof window.MutationObserver === "function" ? new MutationObserver(scan) : null;
    mutations?.observe(host, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
