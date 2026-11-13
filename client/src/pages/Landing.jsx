import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  Eye,
  Lock,
  Moon,
  MousePointerClick,
  NotebookText,
  RefreshCcw,
  Zap,
} from 'lucide-react';
import { statsApi, teamsApi } from '../api';
import Button from '../components/ui/Button';
import SeatMeter from '../components/ui/SeatMeter';
import TeamCard from '../components/teams/TeamCard';
import { TeamCardSkeleton } from '../components/ui/misc';
import RaceDemo from '../components/landing/RaceDemo';

// Landing page (Build Spec §5.1 + copy deck §6). All numbers are real:
// the stats strip reads GET /api/stats and hides itself if the API is
// unreachable — fake figures are never shown.

const FAQS = [
  {
    q: 'Can a team go over its capacity?',
    a: 'No. The join check and the write are one atomic database operation.',
  },
  {
    q: 'What if I click Join twice?',
    a: 'Each click carries an idempotency key; the server returns the first result instead of joining you twice.',
  },
  {
    q: 'Can I leave a team?',
    a: 'Yes, any time, unless you own it. Owners can delete the team.',
  },
  {
    q: 'Who can edit a team?',
    a: 'Only its owner. Capacity cannot go below the current member count.',
  },
  {
    q: 'How is my password stored?',
    a: 'Hashed with bcrypt. We never store or log the plain password.',
  },
  {
    q: 'Is there a limit on team size?',
    a: 'Teams hold between 2 and 12 people, owner included.',
  },
];

const FEATURES = [
  {
    Icon: Zap,
    title: 'Atomic joins',
    text: 'Capacity is enforced by the database, not by hopeful code.',
  },
  {
    Icon: RefreshCcw,
    title: 'Idempotent requests',
    text: 'Retries and double-clicks never create duplicate memberships.',
  },
  {
    Icon: Eye,
    title: 'Live seat counts',
    text: 'Every card shows exactly how many seats are left.',
  },
  {
    Icon: Lock,
    title: 'Secure by default',
    text: 'Hashed passwords, rate limits, validated input.',
  },
  {
    Icon: Moon,
    title: 'Light and dark',
    text: 'Follows your system or your choice.',
  },
  {
    Icon: NotebookText,
    title: 'Open design notes',
    text: 'Read why we built it this way in DESIGN.md.',
  },
];

function HeroCardStack() {
  // A real HTML team-card stack (not an image): the front card's seat
  // meter slowly fills and resets, suggesting a team forming.
  const [filled, setFilled] = useState(2);
  useEffect(() => {
    const timer = setInterval(() => setFilled((f) => (f >= 4 ? 2 : f + 1)), 2400);
    return () => clearInterval(timer);
  }, []);
  const mock = {
    name: 'Midnight Compilers',
    memberCount: filled,
    capacity: 4,
    seatsLeft: 4 - filled,
    isMember: false,
  };
  return (
    <div className="hero-stack" aria-hidden="true">
      <div className="hero-card back-2">
        <div className="team-card-name">Open Source Owls</div>
        <p className="team-card-desc">Documentation, tooling and first issues.</p>
      </div>
      <div className="hero-card back-1">
        <div className="team-card-name">Frontend Foxes</div>
        <p className="team-card-desc">Interfaces, motion and the last pixel.</p>
      </div>
      <div className="hero-card front">
        <div className="team-card-top">
          <span className="team-card-name">{mock.name}</span>
          <span className={`badge ${mock.seatsLeft === 0 ? 'badge-danger' : mock.seatsLeft === 1 ? 'badge-warning' : 'badge-success'}`}>
            {mock.seatsLeft === 0 ? 'Full' : mock.seatsLeft === 1 ? '1 seat left' : `${mock.seatsLeft} seats left`}
          </span>
        </div>
        <p className="team-card-desc">Backend-heavy team looking for one designer.</p>
        <SeatMeter team={mock} />
      </div>
    </div>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div className={`faq-item${open ? ' open' : ''}`}>
      <button type="button" className="faq-q" aria-expanded={open} onClick={onToggle}>
        {item.q}
        <ChevronDown aria-hidden="true" />
      </button>
      {open && <p className="faq-a">{item.a}</p>}
    </div>
  );
}

export default function Landing({ user }) {
  const [stats, setStats] = useState(null);
  const [preview, setPreview] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    statsApi
      .get()
      .then(setStats)
      .catch(() => setStats(null));
    teamsApi
      .list({ status: 'open', sort: 'newest', limit: 3 })
      .then((data) => setPreview(data.data))
      .catch(() => setPreview([]));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Hackathon team formation</span>
            <h1 className="display">Form your team. Every seat counted, every time.</h1>
            <p className="body-l hero-sub">
              Create a team, set its size, and let others join in one click. Joins are processed
              atomically, so a team can never go over capacity, even when a hundred people click at
              the same moment.
            </p>
            <div className="hero-ctas">
              <Link to="/teams">
                <Button size="lg">Browse teams</Button>
              </Link>
              <Link to={user ? '/teams/new' : '/register'}>
                <Button size="lg" variant="secondary">
                  Create a team
                </Button>
              </Link>
            </div>
            <div className="hero-tags">
              <span>Atomic joins</span>
              <span className="divider" />
              <span>Idempotent requests</span>
              <span className="divider" />
              <span>JWT auth</span>
            </div>
          </div>
          <HeroCardStack />
        </div>
      </section>

      {/* Stats strip — real numbers only, hidden if the API is down */}
      {stats && (
        <div className="stats-strip">
          <div className="container stats-row">
            <div className="stat-item">
              <div className="stat-num">{stats.teams}</div>
              <div className="stat-label">Teams formed</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">{stats.members}</div>
              <div className="stat-label">Members seated</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">{stats.openSeats}</div>
              <div className="stat-label">Seats still open</div>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2 className="h2">Three steps, no spreadsheets</h2>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">01</div>
              <h3>Create an account</h3>
              <p>Create an account. Name, email, password. That's all we ask.</p>
            </div>
            <div className="step-card">
              <div className="step-num">02</div>
              <h3>Start a team or pick one</h3>
              <p>Start a team or pick one. Set a capacity from 2 to 12, or browse teams with seats left.</p>
            </div>
            <div className="step-card">
              <div className="step-num">03</div>
              <h3>Join in one click</h3>
              <p>Join in one click. If the seat is yours, you're in. If it just went, we tell you straight away.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why seats never overflow */}
      <section className="section section-alt">
        <div className="container">
          <div className="split-2">
            <div>
              <span className="eyebrow">Engineering</span>
              <h2 className="h2" style={{ margin: '12px 0 16px' }}>
                Why seats never overflow
              </h2>
              <p className="muted" style={{ maxWidth: 560, lineHeight: '26px' }}>
                Picture one cinema seat left and two people at the counter. If the clerk first
                checks the seat and then hands out the ticket, both can pass the check before
                either ticket is issued. That gap is a race condition. TeamForge removes the gap:
                checking for space and adding you happen in a single database operation, so only
                one request can win the last seat.
              </p>
              <p className="small muted" style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                <MousePointerClick size={16} aria-hidden="true" />
                Try it — the button runs the stampede as a simulation.
              </p>
            </div>
            <RaceDemo />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Features</span>
            <h2 className="h2">Built like it has to hold</h2>
          </div>
          <div className="features-grid">
            {FEATURES.map(({ Icon, title, text }) => (
              <div className="feature-card" key={title}>
                <Icon aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live teams preview */}
      {preview === null || preview.length > 0 ? (
        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Open now</span>
              <h2 className="h2">Teams with seats left</h2>
            </div>
            <div className="team-grid">
              {preview === null
                ? [0, 1, 2].map((i) => <TeamCardSkeleton key={i} />)
                : preview.map((team) => <TeamCard key={team.id} team={team} user={user} />)}
            </div>
            <div style={{ marginTop: 32 }}>
              <Link to="/teams">
                <Button variant="secondary">Browse all teams</Button>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">FAQ</span>
            <h2 className="h2">Questions, answered plainly</h2>
          </div>
          <div className="faq-grid">
            <div>
              {FAQS.slice(0, 3).map((item, i) => (
                <FaqItem
                  key={item.q}
                  item={item}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                />
              ))}
            </div>
            <div>
              {FAQS.slice(3).map((item, i) => (
                <FaqItem
                  key={item.q}
                  item={item}
                  open={openFaq === i + 3}
                  onToggle={() => setOpenFaq(openFaq === i + 3 ? null : i + 3)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="cta-band">
        <div className="container">
          <h2 className="h2">Your teammates are already here.</h2>
          <p>Browse the open teams, or start your own and set the size. The seats will hold.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/teams">
              <button type="button" className="btn btn-lg btn-white">
                Browse teams
              </button>
            </Link>
            <Link to={user ? '/dashboard' : '/register'}>
              <button type="button" className="btn btn-lg btn-outline-white">
                {user ? 'My teams' : 'Create account'}
              </button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
