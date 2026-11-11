import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { teamsApi } from '../api';

// Team detail page: member list plus Join / Leave / Delete actions.
// The 409 responses from the API ("Team is full", "Already a member") are
// shown to the user as plain messages — that is the race-proofing working
// as designed, not an error in the UI.
export default function TeamDetail({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    teamsApi
      .get(id)
      .then((data) => setTeam(data.team))
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!team) return <p>Loading team…</p>;

  const isOwner = user && team.owner === user.id;
  const isMember = user && team.members.some((m) => m.user === user.id);
  const seatsLeft = team.capacity - team.memberCount;

  async function handleJoin() {
    setBusy(true);
    setNotice('');
    try {
      const data = await teamsApi.join(id);
      setTeam(data.team);
      setNotice('You joined the team.');
    } catch (err) {
      setNotice(err.message); // e.g. "Team is full" after losing a race — expected UX
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    try {
      const data = await teamsApi.leave(id);
      setTeam(data.team);
      setNotice('You left the team.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this team permanently?')) return;
    await teamsApi.remove(id);
    navigate('/');
  }

  return (
    <div className="card">
      <h1>{team.name}</h1>
      <p>{team.description || 'No description.'}</p>
      <p className={seatsLeft === 0 ? 'full' : 'seats'}>
        {team.memberCount}/{team.capacity} members
        {seatsLeft === 0 ? ' — FULL' : ` — ${seatsLeft} seat(s) left`}
      </p>

      <h2>Members</h2>
      <ul>
        {team.members.map((m) => (
          <li key={m.user}>
            {m.user}
            {m.role === 'owner' ? ' (owner)' : ''}
          </li>
        ))}
      </ul>

      {notice && <p className="notice">{notice}</p>}

      {user ? (
        <div className="actions">
          {!isMember && (
            <button type="button" onClick={handleJoin} disabled={busy || seatsLeft === 0}>
              {seatsLeft === 0 ? 'Team full' : 'Join team'}
            </button>
          )}
          {isMember && !isOwner && (
            <button type="button" onClick={handleLeave} disabled={busy}>
              Leave team
            </button>
          )}
          {isOwner && (
            <button type="button" onClick={handleDelete} className="danger">
              Delete team
            </button>
          )}
        </div>
      ) : (
        <p>Log in to join this team.</p>
      )}
    </div>
  );
}
