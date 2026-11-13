// Avatar (Build Spec §4): initials on a background derived from a hash
// of the user id, from a fixed 6-colour muted palette — the same user
// gets the same colour on every render, on every device.

const PALETTE = ['#5b7a99', '#7a6c9b', '#5f8577', '#9b7b5a', '#8a5a6b', '#667085'];

function colorFor(id) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

export default function Avatar({ user, large = false }) {
  return (
    <span
      className={`avatar${large ? ' avatar-lg' : ''}`}
      style={{ background: colorFor(user?.id) }}
      title={user?.name}
      aria-hidden="true"
    >
      {initialsOf(user?.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 4 }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((m) => (
        <Avatar key={m.id} user={m} />
      ))}
      {extra > 0 && <span className="avatar avatar-more">+{extra}</span>}
    </span>
  );
}
