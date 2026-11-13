import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Compass, PlusCircle } from 'lucide-react';
import { teamsApi } from '../api';
import TeamCard from '../components/teams/TeamCard';
import { EmptyState, TeamCardSkeleton } from '../components/ui/misc';

// Dashboard / "My teams" (Build Spec §5.6): greeting with the member's
// first name, a member-since line, three stat tiles, and underline tabs
// for Joined / Created teams. The tab lives in the URL (?tab=created).

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function Dashboard({ user }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'created' ? 'created' : 'joined';
  const [joined, setJoined] = useState(null);
  const [created, setCreated] = useState(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([teamsApi.mine('joined'), teamsApi.mine('created')])
      .then(([j, c]) => {
        setJoined(j.data);
        setCreated(c.data);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const teams = tab === 'created' ? created : joined;
  const openSeats = (joined || []).reduce((sum, t) => sum + t.seatsLeft, 0);

  return (
    <div className="page">
      <div className="container">
        <h1 className="h1">Hi, {firstName}</h1>
        <p className="muted" style={{ marginBottom: 32 }}>
          {user?.createdAt ? `Member since ${formatDate(user.createdAt)}` : 'Welcome to TeamForge'}
        </p>

        <div className="stat-tiles">
          <div className="stat-tile">
            <div className="stat-tile-num">{joined ? joined.length : '–'}</div>
            <div className="stat-tile-label">Teams joined</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-num">{created ? created.length : '–'}</div>
            <div className="stat-tile-label">Teams created</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-num">{joined ? openSeats : '–'}</div>
            <div className="stat-tile-label">Seats open across your teams</div>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Your teams">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'joined'}
            className={`tab${tab === 'joined' ? ' active' : ''}`}
            onClick={() => setParams({}, { replace: true })}
          >
            Joined
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'created'}
            className={`tab${tab === 'created' ? ' active' : ''}`}
            onClick={() => setParams({ tab: 'created' }, { replace: true })}
          >
            Created
          </button>
        </div>

        {failed ? (
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p>Your teams could not be loaded. Check your connection and try again.</p>
            <button type="button" className="btn" onClick={load}>
              Try again
            </button>
          </div>
        ) : teams === null ? (
          <div className="team-grid" aria-label="Loading your teams">
            {[0, 1, 2].map((i) => (
              <TeamCardSkeleton key={i} />
            ))}
          </div>
        ) : teams.length === 0 ? (
          tab === 'joined' ? (
            <EmptyState
              icon={<Compass aria-hidden="true" />}
              title="You haven't joined a team yet"
              text="You haven't joined a team yet. Teams with open seats are waiting."
              actionLabel="Browse teams"
              onAction={() => navigate('/teams')}
            />
          ) : (
            <EmptyState
              icon={<PlusCircle aria-hidden="true" />}
              title="You haven't created a team yet"
              text="Start a team, set its size, and let others join in one click."
              actionLabel="Create a team"
              onAction={() => navigate('/teams/new')}
            />
          )
        ) : (
          <div className="team-grid">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} user={user} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
