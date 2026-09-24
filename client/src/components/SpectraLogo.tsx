interface SpectraLogoProps {
  size?: number;
  className?: string;
}

export default function SpectraLogo({ size = 40, className = "" }: SpectraLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 drop-shadow-[0_0_12px_rgba(167,139,250,0.45)] ${className}`}
    >
      <defs>
        <linearGradient id="spectra-ghost-body" x1="16" y1="2" x2="16" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ddd6fe" />
          <stop offset="40%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        fill="url(#spectra-ghost-body)"
        d="M16 3C9.4 3 5 8.2 5 14.5V26c0 0 2.4-2.2 4.4 0 2 2.2 3.6-1.8 6.6 0 2-2.2 4.4 0 4.4 0V14.5C20 8.2 15.6 3 16 3Z"
      />
      <ellipse cx="12" cy="14.5" rx="2.1" ry="2.6" fill="#0b1020" opacity="0.88" />
      <ellipse cx="20" cy="14.5" rx="2.1" ry="2.6" fill="#0b1020" opacity="0.88" />
      <circle cx="12.6" cy="13.4" r="0.8" fill="#22d3ee" />
      <circle cx="20.6" cy="13.4" r="0.8" fill="#22d3ee" />
      <path
        d="M13.2 18.2c1 .9 2.1 1.4 2.8 1.4.7 0 1.8-.5 2.8-1.4"
        fill="none"
        stroke="#5b21b6"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}