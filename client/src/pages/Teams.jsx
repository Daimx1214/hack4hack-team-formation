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

  if (loading) return <p>Loading teams…</p>;
  if (error) return <p className="error">{error}</p>;

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
              <p className={seatsLeft === 0 ? 'full' : 'seats'}>
                {team.memberCount}/{team.capacity} members
                {seatsLeft === 0 ? ' — FULL' : ` — ${seatsLeft} seat(s) left`}
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
