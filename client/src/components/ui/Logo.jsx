// Logo (Build Spec §4): a rounded square in the ink colour with an
// ember quarter-circle cut at the lower-right — a filled seat. Built as
// inline SVG so it inherits the theme tokens.

export function LogoMark({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="TeamForge logo"
      style={{ flex: 'none' }}
    >
      <rect x="0" y="0" width="24" height="24" rx="6" fill="var(--text)" />
      <path d="M24 15 A9 9 0 0 1 15 24 L24 24 Z" fill="var(--brand)" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo">
      <LogoMark size={24} />
      <span className="logo-wordmark">TeamForge</span>
    </span>
  );
}
