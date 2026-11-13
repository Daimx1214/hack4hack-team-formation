import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamsApi } from '../api';

// Flat tile colours for team initials — one per team, picked by a stable
// hash of the team name so a team keeps its colour between visits.
const TILE_COLORS = ['#1c5fd6', '#0f766e', '#b45309', '#334155', '#9d2c4a', '#2f5d8a'];

function tileColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function seatBadge(seatsLeft) {
  if (seatsLeft === 0) return <span className="badge badge-full">FULL</span>;
  if (seatsLeft === 1) return <span className="badge badge-few">1 seat left</span>;
  return <span className="badge badge-open">{seatsLeft} seats left</span>;
}

// Home page: hero band with live counts, then the grid of all teams with
// a seats-left indicator and a capacity meter on every card.
export default function Teams({ user }) {
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teamsApi
      .list()
      .then((data) => setTeams(data.teams))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const openSeats = teams.reduce((sum, t) => sum + Math.max(0, t.capacity - t.memberCount), 0);
  const totalMembers = teams.reduce((sum, t) => sum + t.memberCount, 0);

  return (
    <div>
      <section className="hero">
        <div className="hero-inner">
          <h1>Find a team. Join it once. The seat is yours.</h1>
          <p>
            TeamForge matches hackathon participants into teams with fixed capacity. Every join is
            a single atomic operation on the server, so a team can never over-fill — no matter how
            many people click Join at the same second.
          </p>
          <div className="hero-row">
            <Link to={user ? '/create' : '/register'} className="btn-hero">
              {user ? 'Create a team' : 'Register to get started'}
            </Link>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>{loading ? '–' : teams.length}</strong>
                <span>Teams</span>
              </div>
              <div className="hero-stat">
                <strong>{loading ? '–' : openSeats}</strong>
                <span>Open seats</span>
              </div>
              <div className="hero-stat">
                <strong>{loading ? '–' : totalMembers}</strong>
                <span>Members</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="section-head">
          <h2>Teams looking for members</h2>
          <p className="hint">Seats update the moment someone joins.</p>
        </div>

        {loading && <p className="loading">Loading teams…</p>}
        {error && (
          <div className="banner banner-error" role="alert">
            Could not load the teams: {error}
          </div>
        )}
        {!loading && !error && teams.length === 0 && (
          <div className="card empty-state">
            <h3>No teams yet</h3>
            <p>Be the first to create one — it takes less than a minute.</p>
          </div>
        )}

        <div className="team-grid">
          {teams.map((team) => {
            const seatsLeft = team.capacity - team.memberCount;
            const fillPct = Math.round((team.memberCount / team.capacity) * 100);
            return (
              <Link key={team.id} to={`/teams/${team.id}`} className="card team-card">
                <div className="team-card-top">
                  <span className="avatar-tile" style={{ background: tileColor(team.name) }}>
                    {initials(team.name)}
                  </span>
                  <div>
                    <h3>{team.name}</h3>
                    <p className="owner-line">
                      {team.memberCount} of {team.capacity} seats filled
                    </p>
                  </div>
                </div>
                <p className="team-desc">{team.description || 'No description.'}</p>
                {team.skillsNeeded?.length > 0 && (
                  <div className="chips">
                    <span className="chip-label">Looking for:</span>
                    {team.skillsNeeded.map((skill) => (
                      <span key={skill} className="chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
                <div className="team-card-foot">
                  <div
                    className="meter"
                    role="img"
                    aria-label={`${team.memberCount} of ${team.capacity} seats filled`}
                  >
                    <div
                      className={`meter-fill ${seatsLeft === 0 ? 'full' : seatsLeft === 1 ? 'few' : ''}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <div className="seat-row">
                    <span>
                      {team.memberCount}/{team.capacity} members
                    </span>
                    {seatBadge(seatsLeft)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
