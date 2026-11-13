// Seat meter + status badge (Build Spec §3.1 seat semantics, §4).
// Colour is never the only signal: the badge always carries text and the
// meter carries an aria-label with the numbers.

export function seatState(team) {
  if (team.isMember) return 'joined';
  if (team.seatsLeft === 0) return 'full';
  if (team.seatsLeft === 1) return 'last';
  return 'open';
}

export function SeatBadge({ team, withDot = false }) {
  const state = seatState(team);
  const map = {
    open: { cls: 'badge-success', text: `${team.seatsLeft} seats left` },
    last: { cls: 'badge-warning', text: '1 seat left' },
    full: { cls: 'badge-danger', text: 'Full' },
    joined: { cls: 'badge-brand', text: "You're in" },
  };
  const { cls, text } = map[state];
  return (
    <span className={`badge ${cls}`}>
      {withDot && <span className="dot" />}
      {text}
    </span>
  );
}

export default function SeatMeter({ team }) {
  const state = seatState(team);
  const fillKind = state === 'full' ? 'muted' : state === 'last' ? 'warning' : 'brand';
  return (
    <div className="seat-meter">
      <div
        className="seat-segments"
        role="img"
        aria-label={`${team.memberCount} of ${team.capacity} seats filled`}
      >
        {Array.from({ length: team.capacity }, (_, i) => (
          <span
            key={i}
            className={`seat-segment${i < team.memberCount ? ` filled-${fillKind}` : ''}`}
          />
        ))}
      </div>
      <span className="seat-count">
        {team.memberCount} / {team.capacity}
      </span>
    </div>
  );
}
