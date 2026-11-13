// Logo: the TeamForge mark — a white anvil (the forge) on an ember
// tile (logo.png, transparent rounded corners). Square artwork, sized
// by height.

export function LogoMark({ size = 24 }) {
  const height = size + 8;
  return (
    <img
      src="/logo.png"
      alt="TeamForge logo"
      height={height}
      style={{ height, width: 'auto', flex: 'none', display: 'block' }}
    />
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
