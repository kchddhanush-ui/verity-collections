import React, { useEffect, useRef } from "react";
import recoveryPoster from "../assets/loan-recovery-centre.webp";
import recoveryClip from "../assets/loan-recovery-workflow.mp4";

const frameRate = 24;
const frameCount = 192;

function frameAtScroll(stops, scrollY) {
  const next = stops.findIndex(stop => stop.scroll >= scrollY);
  if (next === 0) return 1;
  if (next === -1) return frameCount;
  const start = stops[next - 1];
  const end = stops[next];
  const fraction = (scrollY - start.scroll) / (end.scroll - start.scroll);
  return Math.round(start.frame + (end.frame - start.frame) * fraction);
}

export function RecoveryScene({ chapters }) {
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function" || typeof window.ResizeObserver !== "function") return;
    const stage = stageRef.current;
    const video = videoRef.current;
    const progress = progressRef.current;
    const experience = stage.closest(".lp-experience");
    const panels = [...experience.querySelectorAll("[data-recovery-frame]")];
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference) and (min-height: 590px)");
    let stops = [];
    let scheduledFrame = 0;
    let lastRequestedFrame = 0;

    function updateFrame() {
      scheduledFrame = 0;
      const frame = frameAtScroll(stops, window.scrollY);
      progress.style.transform = `scaleX(${(frame - 1) / (frameCount - 1)})`;
      if (video.readyState < HTMLMediaElement.HAVE_METADATA || video.seeking || frame === lastRequestedFrame) return;
      lastRequestedFrame = frame;
      // Seek within the frame so timestamp rounding cannot select its predecessor.
      video.currentTime = (frame - 1 + .25) / frameRate;
    }

    function scheduleFrame() {
      if (motion.matches && !scheduledFrame) scheduledFrame = window.requestAnimationFrame(updateFrame);
    }

    function measureStops() {
      if (!motion.matches) return;
      const page = experience.getBoundingClientRect();
      const scrollY = window.scrollY;
      const viewport = window.innerHeight;
      const header = Number.parseFloat(getComputedStyle(stage).insetBlockStart) || 0;
      stops = [
        { scroll: scrollY + page.top - header, frame: 1 },
        ...panels.map(panel => {
          const rect = panel.getBoundingClientRect();
          const visibleTop = Number.parseFloat(getComputedStyle(panel).scrollMarginBlockStart) || 0;
          return {
            scroll: scrollY + rect.top + (rect.height - viewport - visibleTop) / 2,
            frame: Number(panel.dataset.recoveryFrame),
          };
        }),
        { scroll: scrollY + page.bottom - viewport, frame: frameCount },
      ];
      scheduleFrame();
    }

    function showVideo() {
      if (motion.matches && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) video.dataset.ready = "";
      scheduleFrame();
    }

    function hideVideo() {
      delete video.dataset.ready;
    }

    function releaseVideo() {
      window.cancelAnimationFrame(scheduledFrame);
      scheduledFrame = 0;
      lastRequestedFrame = 0;
      hideVideo();
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    }

    function syncMotion() {
      if (motion.matches) {
        measureStops();
        if (!video.hasAttribute("src")) video.src = recoveryClip;
      } else {
        releaseVideo();
      }
    }

    const observer = new window.ResizeObserver(measureStops);
    observer.observe(experience);
    window.addEventListener("scroll", scheduleFrame, { passive: true });
    window.addEventListener("resize", measureStops);
    motion.addEventListener("change", syncMotion);
    video.addEventListener("loadedmetadata", scheduleFrame);
    video.addEventListener("loadeddata", showVideo);
    video.addEventListener("seeked", showVideo);
    video.addEventListener("error", hideVideo);
    syncMotion();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleFrame);
      window.removeEventListener("resize", measureStops);
      motion.removeEventListener("change", syncMotion);
      video.removeEventListener("loadedmetadata", scheduleFrame);
      video.removeEventListener("loadeddata", showVideo);
      video.removeEventListener("seeked", showVideo);
      video.removeEventListener("error", hideVideo);
      releaseVideo();
    };
  }, []);

  return (
    <figure className="lp-stage" ref={stageRef}>
      <div className="lp-stage-inner">
        <div className="lp-scene">
          <img
            className="lp-scene-art"
            src={recoveryPoster}
            alt="Illustrated recovery centre with overdue loan files, legal scales, and checked recovery folders."
            width={1280}
            height={720}
            fetchPriority="high"
          />
          <video className="lp-scene-video" ref={videoRef} width={1280} height={720} preload="auto" muted playsInline aria-hidden="true"/>
        </div>
        <figcaption>
          <nav className="lp-stage-nav" aria-label="Recovery stages">
            {chapters.map(({ id, label }) => <a key={id} href={"#" + id}>{label}</a>)}
          </nav>
          <div className="lp-stage-progress" aria-hidden="true"><span ref={progressRef}/></div>
        </figcaption>
      </div>
    </figure>
  );
}
