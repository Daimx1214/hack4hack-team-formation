import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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

// Same flat colour set as the team tiles on the home page.
const AVATAR_COLORS = ['#1c5fd6', '#0f766e', '#b45309', '#334155', '#9d2c4a', '#2f5d8a'];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

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
      <div className="container">
        <div className="banner banner-error" role="alert">
          Could not load this team: {error}
        </div>
      </div>
    );
  }
  if (!team) return <p className="loading">Loading team…</p>;

  const isOwner = user && team.owner === user.id;
  const isMember = user && team.members.some((m) => memberId(m) === user.id);
  const seatsLeft = team.capacity - team.memberCount;
  const fillPct = Math.round((team.memberCount / team.capacity) * 100);

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
    <div className="container">
      <div className="card detail-card">
        <h1>{team.name}</h1>
        <p className="detail-desc">{team.description || 'No description.'}</p>

        <div className="detail-seats">
          <span className="count">
            {team.memberCount}/{team.capacity} members
          </span>
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
          <span
            className={`badge ${
              seatsLeft === 0 ? 'badge-full' : seatsLeft === 1 ? 'badge-few' : 'badge-open'
            }`}
          >
            {seatsLeft === 0 ? 'FULL' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`}
          </span>
        </div>

        {team.skillsNeeded?.length > 0 && (
          <div className="chips" style={{ marginBottom: 20 }}>
            <span className="chip-label">Looking for:</span>
            {team.skillsNeeded.map((skill) => (
              <span key={skill} className="chip">
                {skill}
              </span>
            ))}
          </div>
        )}

        <h2>Members</h2>
        <ul className="member-list">
          {team.members.map((m) => (
            <li key={memberId(m)} className="member-row">
              <span className="avatar" style={{ background: avatarColor(memberName(m)) }}>
                {initials(memberName(m))}
              </span>
              <span className="member-name">{memberName(m)}</span>
              {m.role === 'owner' && <span className="tag-owner">Owner</span>}
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
              <button type="button" onClick={handleLeave} disabled={busy} className="ghost">
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
          <div className="actions">
            <Link to="/login" className="btn-link">
              Log in to join this team
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
