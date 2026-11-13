import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, SearchX } from 'lucide-react';
import { teamsApi } from '../api';
import Button from '../components/ui/Button';
import TeamCard from '../components/teams/TeamCard';
import { EmptyState, Pagination, TeamCardSkeleton } from '../components/ui/misc';
import { useToast } from '../components/ui/Toast';

// Browse teams (Build Spec §5.3): all state lives in the URL
// (?q=&status=&sort=&page=) so links are shareable and Back works.
// Search is debounced 300ms. Joins happen in place on the card; the
// server response replaces the card's team (source of truth), and the
// §5.8 toast copy is used for each outcome.

const PAGE_SIZE = 12;
const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'full', label: 'Full' },
];

export default function Teams({ user }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

  const [searchInput, setSearchInput] = useState(q);
  const [teams, setTeams] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState(null);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const debounce = useRef(null);

  const load = useCallback(() => {
    setError('');
    teamsApi
      .list({ q: q || undefined, status: status || undefined, sort, page, limit: PAGE_SIZE })
      .then((data) => {
        setTeams(data.data);
        setMeta(data.meta);
      })
      .catch(() => {
        setTeams([]);
        setError('Teams could not be loaded. Check your connection and try again.');
      });
  }, [q, status, sort, page]);

  // Refetch when the session resolves (see TeamDetail): card member
  // states are computed from the viewer's token.
  const viewerId = user?.id || null;
  useEffect(() => {
    setTeams(null);
    load();
  }, [load, viewerId]);

  // Keep the input in sync when the URL changes elsewhere (Back button).
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  function updateParams(next) {
    setParams((prev) => {
      const merged = new URLSearchParams(prev);
      Object.entries(next).forEach(([key, value]) => {
        if (value === '' || value === undefined || value === null) merged.delete(key);
        else merged.set(key, String(value));
      });
      return merged;
    });
  }

  function onSearchChange(value) {
    setSearchInput(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => updateParams({ q: value, page: '' }), 300);
  }

  async function quickJoin(team) {
    setJoiningId(team.id);
    try {
      const data = await teamsApi.join(team.id);
      setTeams((current) => current.map((t) => (t.id === team.id ? data.team : t)));
      toast.success(`You joined ${team.name}.`);
    } catch (err) {
      if (err.code === 'TEAM_FULL') {
        // Flip the card to Full immediately (Spec §5.3/§5.8).
        setTeams((current) =>
          current.map((t) => (t.id === team.id ? { ...t, seatsLeft: 0, isFull: true, memberCount: t.capacity } : t))
        );
        toast.warning('This team just filled up. Pick another one.');
      } else if (err.code === 'ALREADY_MEMBER') {
        toast.info("You're already in this team.");
        load();
      } else if (err.code === 'RATE_LIMITED') {
        toast.error('Too many attempts. Try again in a minute.');
      } else {
        toast.error(err.message || 'Something went wrong on our side.');
      }
    } finally {
      setJoiningId(null);
    }
  }

  const hasFilters = q !== '' || status !== '';

  return (
    <div className="page">
      <div className="container">
        <div className="browse-head">
          <div>
            <h1 className="h1">Teams</h1>
            <p className="muted">Every team here has a fixed size. When it fills, it fills — no exceptions.</p>
          </div>
          <Link to={user ? '/teams/new' : '/login?returnTo=/teams/new'}>
            <Button>
              <Plus size={16} aria-hidden="true" /> Create team
            </Button>
          </Link>
        </div>

        <div className="toolbar">
          <div className="search-wrap">
            <Search aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder="Search teams"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search teams"
            />
          </div>
          <div className="seg-filter" role="group" aria-label="Filter by status">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={status === opt.value}
                onClick={() => updateParams({ status: opt.value, page: '' })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            className="sort-select"
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value, page: '' })}
            aria-label="Sort teams"
          >
            <option value="newest">Newest</option>
            <option value="seats">Most seats left</option>
          </select>
        </div>

        {user && (
          <form
            className="code-join"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!code.trim() || codeBusy) return;
              setCodeBusy(true);
              try {
                const data = await teamsApi.joinByCode(code);
                if (data.application) {
                  toast.info('Request sent. The owner will review it.');
                } else {
                  toast.success(`You joined ${data.team.name}.`);
                }
                navigate(`/teams/${data.team.id}`);
              } catch (err) {
                if (err.status === 404) {
                  toast.error('That invite code does not match a team.');
                } else if (err.code === 'TEAM_FULL') {
                  toast.warning('This team just filled up. Pick another one.');
                } else if (err.code === 'ALREADY_MEMBER') {
                  toast.info("You're already in this team.");
                } else {
                  toast.error(err.message || 'Something went wrong on our side.');
                }
              } finally {
                setCodeBusy(false);
              }
            }}
          >
            <label className="small muted" htmlFor="invite-code-input">
              Have an invite code?
            </label>
            <input
              id="invite-code-input"
              className="input code-input"
              type="text"
              placeholder="ABCD2345"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              maxLength={32}
            />
            <Button type="submit" variant="secondary" loading={codeBusy}>
              Join with code
            </Button>
          </form>
        )}

        {meta && !error && (
          <p className="result-count">
            {meta.total} team{meta.total === 1 ? '' : 's'}
          </p>
        )}

        {error ? (
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p>{error}</p>
            <Button onClick={load}>Try again</Button>
          </div>
        ) : teams === null ? (
          <div className="team-grid" aria-label="Loading teams">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <TeamCardSkeleton key={i} />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="No teams match your search"
            text="No teams match your search. Try fewer filters, or start the team you wish existed."
            actionLabel={hasFilters ? 'Clear filters' : 'Create a team'}
            onAction={() =>
              hasFilters
                ? updateParams({ q: '', status: '', page: '' })
                : navigate(user ? '/teams/new' : '/login?returnTo=/teams/new')
            }
          />
        ) : (
          <>
            <div className="team-grid">
              {teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  user={user}
                  onJoin={quickJoin}
                  joining={joiningId === team.id}
                />
              ))}
            </div>
            {meta && (
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onPage={(p) => updateParams({ page: p === 1 ? '' : p })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
