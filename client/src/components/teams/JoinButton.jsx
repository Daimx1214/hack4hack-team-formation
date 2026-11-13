import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { teamsApi } from '../../api';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';

// The join action and its states (Build Spec §5.4):
//   Guest     → "Log in to join" linking to /login?returnTo=<this page>
//   Available → "Join team"; while pending, "Joining..." (disabled).
//               The API layer keeps ONE idempotency key per join intent,
//               so a retry after a network failure replays safely instead
//               of joining twice (§8).
//   Member    → "You're in" pill (disabled) — leaving lives in the page.
//   Full      → "Team is full" (disabled) + link to other open teams.
//   Owner     → handled by the owner zone, not this component.
// Outcomes follow the §5.8 toast contract; the server's team object is
// always the source of truth via onUpdate.

export default function JoinButton({ team, user, onUpdate }) {
  const [joining, setJoining] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Order matters: membership first (a member of a full team is still
  // "in"), then Full (truthful for guests too — no point sending them
  // to log in for a seat that does not exist), then the guest prompt.
  if (user && team.isMember) {
    return (
      <button type="button" className="btn btn-block member-pill" disabled>
        <Check size={16} aria-hidden="true" /> You're in
      </button>
    );
  }

  if (team.isFull) {
    return (
      <div>
        <Button block disabled>
          Team is full
        </Button>
        <p className="small" style={{ marginTop: 8 }}>
          <Link to="/teams?status=open">Browse other open teams</Link>
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Link to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}>
          <Button block>Log in to join</Button>
        </Link>
        <p className="small muted" style={{ marginTop: 8 }}>
          You need an account to take a seat.
        </p>
      </div>
    );
  }

  async function join() {
    setJoining(true);
    try {
      const data = await teamsApi.join(team.id);
      onUpdate(data.team);
      toast.success(`You joined ${team.name}.`);
    } catch (err) {
      if (err.code === 'TEAM_FULL') {
        onUpdate({ ...team, seatsLeft: 0, isFull: true, memberCount: team.capacity });
        toast.warning('This team just filled up. Pick another one.');
      } else if (err.code === 'ALREADY_MEMBER') {
        toast.info("You're already in this team.");
        const fresh = await teamsApi.get(team.id).catch(() => null);
        if (fresh) onUpdate(fresh.team);
      } else if (err.status === 401) {
        toast.error('Your session expired. Log in again.');
        navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
      } else if (err.code === 'RATE_LIMITED') {
        toast.error('Too many attempts. Try again in a minute.');
      } else {
        toast.error('Something went wrong on our side.');
      }
    } finally {
      setJoining(false);
    }
  }

  return (
    <Button block loading={joining} onClick={join}>
      {joining ? 'Joining...' : 'Join team'}
    </Button>
  );
}
