import { Link } from 'react-router-dom';
import SeatMeter, { SeatBadge } from '../ui/SeatMeter';
import { AvatarStack } from '../ui/Avatar';
import Button from '../ui/Button';

// Team card (Build Spec §4): the whole card links to the detail page.
// The footer button is the quick action: for a logged-in non-member on
// an open team it joins in place (the parent owns the API call, the
// toasts and the list update — the server response is the source of
// truth); in every other state it is a View button. It never nests a
// navigation inside the card link: it prevents the default.

export default function TeamCard({ team, user, onJoin, joining = false }) {
  const canQuickJoin = Boolean(user && onJoin && !team.isMember && team.seatsLeft > 0);

  return (
    <Link to={`/teams/${team.id}`} className="team-card" aria-label={`View team ${team.name}`}>
      <div className="team-card-top">
        <span className="team-card-name">{team.name}</span>
        <SeatBadge team={team} withDot />
      </div>
      {team.description ? (
        <p className="team-card-desc">{team.description}</p>
      ) : (
        <p className="team-card-desc muted">No description yet.</p>
      )}
      <SeatMeter team={team} />
      <div className="team-card-footer">
        <AvatarStack members={team.members} />
        {canQuickJoin ? (
          <Button
            size="sm"
            loading={joining}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onJoin(team);
            }}
          >
            Join team
          </Button>
        ) : (
          <Button
            size="sm"
            variant={team.isMember ? 'secondary' : 'primary'}
            onClick={(e) => {
              // Let the card link navigate; just stop the button's own
              // default behaviour quirks.
              e.stopPropagation();
            }}
          >
            {team.isMember ? 'View team' : 'View'}
          </Button>
        )}
      </div>
    </Link>
  );
}
