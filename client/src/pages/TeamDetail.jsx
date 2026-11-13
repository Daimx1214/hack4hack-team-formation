import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronRight, Copy, Pencil, RefreshCw, SearchX, Trash2, X } from 'lucide-react';
import { teamsApi } from '../api';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import SeatMeter, { SeatBadge } from '../components/ui/SeatMeter';
import { EmptyState, Skeleton } from '../components/ui/misc';
import { useToast } from '../components/ui/Toast';
import JoinButton from '../components/teams/JoinButton';

// Team detail (Build Spec §5.4): breadcrumb, header with status badge,
// created date and owner chip; About + Members on the left (8 cols); a
// sticky seat card on the right (4 cols) carrying the Join state
// machine, the member Leave action and the owner zone (Edit / Delete,
// both confirmed where destructive). All copy follows the §6 deck.

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TeamDetail({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'leave' | 'delete'
  const [acting, setActing] = useState(false);
  const [applications, setApplications] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setError('');
    teamsApi
      .get(id)
      .then((data) => setTeam(data.team))
      .catch((err) => {
        if (err.status === 404 || err.code === 'NOT_FOUND' || err.code === 'INVALID_ID') {
          setError('notfound');
        } else {
          setError('failed');
        }
      });
  }, [id]);

  // Refetch when the session resolves: isOwner / isMember are computed
  // by the API from the viewer's token, and on a fresh page load the
  // session restore (refresh cookie → /me) can land after the first
  // fetch. Without this, an owner would briefly — then permanently —
  // see a "Join team" button on their own team.
  const viewerId = user?.id || null;
  useEffect(() => {
    setTeam(null);
    load();
  }, [load, viewerId]);

  useEffect(() => {
    if (team) document.title = `${team.name} | TeamForge`;
  }, [team]);

  // Owners of any team get the review queue (join applications). Loaded
  // once the team — and with it isOwner — is known.
  const loadApplications = useCallback(() => {
    teamsApi
      .applications(id)
      .then((data) => setApplications(data.data))
      .catch(() => setApplications([]));
  }, [id]);

  useEffect(() => {
    if (team && team.isOwner) loadApplications();
  }, [team, loadApplications]);

  async function decide(applicationId, action) {
    setDeciding(applicationId);
    try {
      if (action === 'approve') {
        const data = await teamsApi.approve(id, applicationId);
        setTeam(data.team);
        toast.success('Request approved.');
      } else {
        await teamsApi.reject(id, applicationId);
        toast.success('Request declined.');
      }
      loadApplications();
    } catch (err) {
      if (err.code === 'TEAM_FULL') {
        toast.warning('This team just filled up. Pick another one.');
      } else {
        toast.error(err.message || 'Something went wrong on our side.');
      }
    } finally {
      setDeciding(null);
    }
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(team.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed. Select the code and copy it manually.');
    }
  }

  async function regenerateCode() {
    try {
      const data = await teamsApi.regenerateCode(id);
      setTeam((prev) => ({ ...prev, inviteCode: data.inviteCode }));
      toast.success('New invite code generated. The old one no longer works.');
    } catch (err) {
      toast.error(err.message || 'Something went wrong on our side.');
    }
  }

  async function leave() {
    setActing(true);
    try {
      const data = await teamsApi.leave(id);
      setTeam(data.team);
      setModal(null);
      toast.success(`You left ${team.name}.`);
    } catch (err) {
      toast.error(err.message || 'Something went wrong on our side.');
    } finally {
      setActing(false);
    }
  }

  async function remove() {
    setActing(true);
    try {
      await teamsApi.remove(id);
      toast.success('Team deleted.');
      navigate('/teams');
    } catch (err) {
      toast.error(err.message || 'Something went wrong on our side.');
      setActing(false);
      setModal(null);
    }
  }

  if (error === 'notfound') {
    return (
      <div className="page">
        <div className="container">
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="Team not found"
            text="This team doesn't exist, or it was deleted by its owner."
            actionLabel="Browse teams"
            onAction={() => navigate('/teams')}
          />
        </div>
      </div>
    );
  }

  if (error === 'failed') {
    return (
      <div className="page">
        <div className="container">
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p>This team could not be loaded. Check your connection and try again.</p>
            <Button onClick={load}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="page">
        <div className="container" aria-label="Loading team">
          <Skeleton height={20} width={180} style={{ marginBottom: 16 }} />
          <Skeleton height={44} width="55%" style={{ marginBottom: 24 }} />
          <div className="detail-grid">
            <div>
              <Skeleton height={16} style={{ marginBottom: 10 }} />
              <Skeleton height={16} width="80%" style={{ marginBottom: 10 }} />
              <Skeleton height={16} width="60%" />
            </div>
            <Skeleton height={220} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/teams">Teams</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="current" aria-current="page">
            {team.name}
          </span>
        </nav>

        <div className="detail-head">
          <h1 className="h1">{team.name}</h1>
          <SeatBadge team={team} withDot />
        </div>
        <div className="detail-meta">
          <span>Created {formatDate(team.createdAt)}</span>
          <span className="owner-chip">
            <Avatar user={team.owner} />
            {team.owner.name}
            <span className="tag-owner">Owner</span>
          </span>
        </div>

        <div className="detail-grid">
          <div>
            <section className="detail-section" aria-labelledby="about-heading">
              <h2 id="about-heading">About</h2>
              {team.description ? (
                <p style={{ lineHeight: '26px', maxWidth: 640 }}>{team.description}</p>
              ) : (
                <p className="muted">No description yet.</p>
              )}
            </section>

            <section className="detail-section" aria-labelledby="members-heading">
              <h2 id="members-heading">Members ({team.memberCount})</h2>
              <ul className="member-list">
                {team.members.map((member) => (
                  <li className="member-row" key={member.id}>
                    <Avatar user={member} />
                    <span className="member-name">{member.name}</span>
                    {member.role === 'owner' && <span className="tag-owner">Owner</span>}
                    <span className="joined-at">{formatDate(member.joinedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {team.isOwner && (
              <section className="detail-section" aria-labelledby="owner-tools-heading">
                <h2 id="owner-tools-heading">Invite and requests</h2>
                {team.inviteCode && (
                  <div style={{ marginBottom: 20 }}>
                    <p className="small muted" style={{ marginBottom: 8 }}>
                      Anyone with this code can join from the Teams page. Only you can
                      see it.
                    </p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code className="invite-code">{team.inviteCode}</code>
                      <Button size="sm" variant="secondary" onClick={copyInviteCode}>
                        {copied ? (
                          <>
                            <Check size={14} aria-hidden="true" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} aria-hidden="true" /> Copy
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={regenerateCode}>
                        <RefreshCw size={14} aria-hidden="true" /> New code
                      </Button>
                    </div>
                  </div>
                )}
                {applications === null ? (
                  <p className="small muted">Loading requests...</p>
                ) : applications.filter((a) => a.status === 'pending').length === 0 ? (
                  <p className="small muted">
                    {team.requireApproval
                      ? 'No join requests waiting. Requests will appear here when someone asks to join.'
                      : 'No join requests. Turn on join approval in Edit team to review requests before seats are taken.'}
                  </p>
                ) : (
                  <ul className="member-list">
                    {applications
                      .filter((a) => a.status === 'pending')
                      .map((application) => (
                        <li className="member-row" key={application.id}>
                          <Avatar user={application.user} />
                          <span className="member-name">{application.user.name}</span>
                          <span className="joined-at">asked {formatDate(application.createdAt)}</span>
                          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                            <Button
                              size="sm"
                              loading={deciding === application.id}
                              onClick={() => decide(application.id, 'approve')}
                            >
                              <Check size={14} aria-hidden="true" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deciding === application.id}
                              onClick={() => decide(application.id, 'reject')}
                            >
                              <X size={14} aria-hidden="true" /> Decline
                            </Button>
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <aside className="side-card" aria-label="Seats and actions">
            <span className="eyebrow">Seats</span>
            <div style={{ marginTop: 12 }}>
              <SeatMeter team={team} />
            </div>
            <p className="seat-count-big">
              {team.memberCount} / {team.capacity} seats filled
            </p>

            {team.isOwner ? (
              <div className="owner-zone">
                <button type="button" className="btn btn-block owner-pill" disabled>
                  You own this team
                </button>
                <Link to={`/teams/${team.id}/edit`}>
                  <Button block variant="secondary">
                    <Pencil size={15} aria-hidden="true" /> Edit team
                  </Button>
                </Link>
                <Button block variant="ghost" onClick={() => setModal('delete')}>
                  <Trash2 size={15} aria-hidden="true" /> Delete team
                </Button>
              </div>
            ) : (
              <>
                <JoinButton team={team} user={user} onUpdate={setTeam} />
                {user && team.isMember && (
                  <button type="button" className="text-btn" onClick={() => setModal('leave')}>
                    Leave team
                  </button>
                )}
                {!team.isMember && !team.isFull && user && !team.viewerApplication && (
                  <p className="small muted" style={{ marginTop: 12 }}>
                    {team.requireApproval
                      ? 'The owner reviews every request before a seat is taken.'
                      : 'Joining takes the seat immediately. You can leave any time.'}
                  </p>
                )}
              </>
            )}
          </aside>
        </div>
      </div>

      <Modal
        open={modal === 'leave'}
        onClose={() => setModal(null)}
        title={`Leave ${team.name}?`}
        actions={
          <Button loading={acting} onClick={leave}>
            Leave team
          </Button>
        }
      >
        <p>
          Leave {team.name}? Your seat will open up for someone else.
        </p>
      </Modal>

      <Modal
        open={modal === 'delete'}
        onClose={() => setModal(null)}
        title={`Delete ${team.name}?`}
        actions={
          <Button variant="danger" loading={acting} onClick={remove}>
            Delete team
          </Button>
        }
      >
        <p>
          Delete {team.name}? All members will be removed. This can't be undone.
        </p>
      </Modal>
    </div>
  );
}
