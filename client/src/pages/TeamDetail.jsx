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
  const [notice, setNotice] = useState(''); // green banner: something worked
  const [actionError, setActionError] = useState(''); // red banner: API said no (e.g. 409)
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    teamsApi
      .get(id)
      .then((data) => setTeam(data.team))
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        Could not load this team: {error}
      </div>
    );
  }
  if (!team) return <p className="loading">Loading team…</p>;

  const isOwner = user && team.owner === user.id;
  const isMember = user && team.members.some((m) => m.user === user.id);
  const seatsLeft = team.capacity - team.memberCount;

  async function handleJoin() {
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      const data = await teamsApi.join(id);
      setTeam(data.team);
      setNotice('You joined the team.');
    } catch (err) {
      // A 409 here ("Team is full" / "already a member") is the race-proofing
      // doing its job — show it as a clear banner and refresh the numbers.
      setActionError(err.message);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      const data = await teamsApi.leave(id);
      setTeam(data.team);
      setNotice('You left the team.');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this team permanently?')) return;
    setActionError('');
    try {
      await teamsApi.remove(id);
      navigate('/');
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div className="card">
      <h1>{team.name}</h1>
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

      <h2>Members</h2>
      <ul className="member-list">
        {team.members.map((m) => (
          <li key={m.user}>
            {m.user}
            {m.role === 'owner' ? ' (owner)' : ''}
          </li>
        ))}
      </ul>

      {notice && (
        <div className="banner banner-success" role="status">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="banner banner-error" role="alert">
          {actionError}
        </div>
      )}

      {user ? (
        <div className="actions">
          {!isMember && (
            <button type="button" onClick={handleJoin} disabled={busy || seatsLeft === 0}>
              {busy ? 'Joining…' : seatsLeft === 0 ? 'Team full' : 'Join team'}
            </button>
          )}
          {isMember && !isOwner && (
            <button type="button" onClick={handleLeave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave team'}
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
