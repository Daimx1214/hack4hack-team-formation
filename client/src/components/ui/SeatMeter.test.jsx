import { render, screen } from '@testing-library/react';
import SeatMeter, { SeatBadge, seatState } from './SeatMeter';

// Seat semantics (Build Spec §3.1): colour is never the only signal —
// the badge text and the meter's aria-label carry the numbers.

const team = (overrides = {}) => ({
  capacity: 4,
  memberCount: 2,
  seatsLeft: 2,
  isMember: false,
  ...overrides,
});

describe('seatState', () => {
  it('maps seat counts to open / last / full / joined', () => {
    expect(seatState(team())).toBe('open');
    expect(seatState(team({ seatsLeft: 1 }))).toBe('last');
    expect(seatState(team({ seatsLeft: 0 }))).toBe('full');
    expect(seatState(team({ seatsLeft: 0, isMember: true }))).toBe('joined');
  });
});

describe('SeatMeter', () => {
  it('renders one segment per seat and the mono count, with an aria-label', () => {
    const { container } = render(<SeatMeter team={team()} />);
    expect(container.querySelectorAll('.seat-segment')).toHaveLength(4);
    expect(container.querySelectorAll('.seat-segment.filled-brand')).toHaveLength(2);
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '2 of 4 seats filled');
  });

  it('fills a full team with the muted kind, not the brand colour', () => {
    const { container } = render(
      <SeatMeter team={team({ memberCount: 4, seatsLeft: 0 })} />
    );
    expect(container.querySelectorAll('.seat-segment.filled-muted')).toHaveLength(4);
  });
});

describe('SeatBadge', () => {
  it('says how many seats are left, warns on the last seat, and says Full', () => {
    const { unmount } = render(<SeatBadge team={team()} />);
    expect(screen.getByText('2 seats left')).toBeInTheDocument();
    unmount();
    render(<SeatBadge team={team({ seatsLeft: 1 })} />);
    expect(screen.getByText('1 seat left')).toBeInTheDocument();
    unmount();
    render(<SeatBadge team={team({ seatsLeft: 0 })} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });
});
