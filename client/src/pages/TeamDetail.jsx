import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { teamsApi } from '../api';

// Team detail page: member list plus Join / Leave / Delete actions.
// The 409 responses from the API ("Team is full", "Already a member") are
// shown to the user as plain messages — that is the race-proofing working
// as designed, not an error in the UI.

// members.user is a populated user object ({ id, name, email }) in GET
// responses, but a plain id string in join/leave responses. These helpers
// hide that difference so the rest of the page doesn't have to care.
const memberId = (m) => (typeof m.user === 'object' ? m.user.id : m.user);
const memberName = (m) => (typeof m.user === 'object' ? m.user.name : m.user);
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
  const isMember = user && team.members.some((m) => memberId(m) === user.id);
  const seatsLeft = team.capacity - team.memberCount;

  async function handleJoin() {
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      await teamsApi.join(id);
      setNotice('You joined the team.');
      // Refetch instead of using the join response: GET returns the member
      // list with populated names, the join response carries raw ids.
      load();
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
      await teamsApi.leave(id);
      setNotice('You left the team.');
      load(); // refetch for the populated member names (see handleJoin)
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
          <li key={memberId(m)}>
            {memberName(m)}
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
