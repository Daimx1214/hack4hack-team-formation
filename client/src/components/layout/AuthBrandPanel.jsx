import SeatMeter from '../ui/SeatMeter';
import { LogoMark } from '../ui/Logo';

// Right-hand brand panel for the auth pages (Build Spec §5.2): a real
// product card mock and a one-sentence value statement on --surface-2.

const MOCK_TEAM = {
  name: 'API Wizards',
  memberCount: 3,
  capacity: 4,
  seatsLeft: 1,
  isMember: false,
};

export default function AuthBrandPanel() {
  return (
    <div className="auth-brand-side" aria-hidden="true">
      <div className="auth-brand-inner">
        <LogoMark size={32} />
        <div className="team-card" style={{ marginTop: 24 }}>
          <div className="team-card-top">
            <span className="team-card-name">{MOCK_TEAM.name}</span>
            <span className="badge badge-warning">1 seat left</span>
          </div>
          <p className="team-card-desc">APIs, queues and the odd webhook.</p>
          <SeatMeter team={MOCK_TEAM} />
        </div>
        <p className="value">Set the size of your team, and the seats take care of themselves.</p>
      </div>
    </div>
  );
}
