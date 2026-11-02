import React, { useId } from "react";
import { logoPaths } from "../assets/lawcovery-logo-paths";

export function LawcoveryLogo() {
  const id = useId();
  const frame = `${id}-logo-frame`;
  return (
    <svg
      className="lawcovery-logo"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1070 256"
      width="1070"
      height="256"
      role="img"
      aria-label="Lawcovery"
      focusable="false"
    >
      <defs>
        <linearGradient id={frame} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--logo-accent)" />
          <stop offset="39.63%" stopColor="var(--logo-accent)" />
          <stop offset="39.63%" stopColor="var(--logo-outline)" />
          <stop offset="100%" stopColor="var(--logo-outline)" />
        </linearGradient>
      </defs>
      <path {...logoPaths[0]} fill={`url(#${frame})`} />
      {logoPaths.slice(1, -1).map((path, index) => (
        <path key={index} {...path} fill="currentColor" />
      ))}
      <path {...logoPaths.at(-1)} fill="var(--logo-accent)" />
    </svg>
  );
}
