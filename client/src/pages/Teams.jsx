import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamsApi } from '../api';

// Home page: list of all teams with a seats-left indicator.
export default function Teams() {
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

  if (loading) return <p className="loading">Loading teams…</p>;
  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        Could not load the teams: {error}
      </div>
    );
  }

  return (
    <div>
      <h1>Teams looking for members</h1>
      {teams.length === 0 && <p>No teams yet — be the first to create one.</p>}
      <div className="team-grid">
        {teams.map((team) => {
          const seatsLeft = team.capacity - team.memberCount;
          return (
            <Link key={team.id} to={`/teams/${team.id}`} className="card team-card">
              <h2>{team.name}</h2>
              <p>{team.description || 'No description.'}</p>
              <p>
                {team.memberCount}/{team.capacity} members{' '}
                <span
                  className={`badge ${
                    seatsLeft === 0 ? 'badge-full' : seatsLeft === 1 ? 'badge-few' : 'badge-open'
                  }`}
                >
                  {seatsLeft === 0 ? 'FULL' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`}
                </span>
              </p>
              {team.skillsNeeded?.length > 0 && (
                <p className="skills">Looking for: {team.skillsNeeded.join(', ')}</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
