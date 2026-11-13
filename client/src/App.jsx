import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { authApi, getToken, setToken } from './api';
import Login from './pages/Login';
import Register from './pages/Register';
import Teams from './pages/Teams';
import TeamDetail from './pages/TeamDetail';
import CreateTeam from './pages/CreateTeam';

// Reset the scroll position on every navigation — without this, opening
// a page from a scrolled list leaves you halfway down the new page.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Inline SVG icons for the theme toggle (sun / moon) — drawn, not emoji.
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

// The app keeps the logged-in user in state at the top level and passes
// `user` / `onAuth` down to pages. Simple prop drilling is fine at this size.
export default function App() {
  const [user, setUser] = useState(null);
  // The initial value was already applied to <html> by the inline script
  // in index.html (from localStorage or the OS preference) — read it back
  // so React and the DOM start in agreement.
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('teamforge-theme', theme);
    } catch {
      // Private mode etc. — the theme still applies for this session.
    }
  }, [theme]);

  // On first load, if a token exists, ask the API who we are.
  useEffect(() => {
    if (!getToken()) return;
    authApi
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null)); // stale token — clear it
  }, []);

  function handleAuth(data) {
    setToken(data.accessToken);
    setUser(data.user);
    navigate('/');
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    navigate('/');
  }

  return (
    <div className="app">
      <ScrollToTop />
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">TF</span>
            <span className="brand-text">
              TeamForge
              <small>Race-proof team formation</small>
            </span>
          </Link>
          <nav>
            <Link to="/">Teams</Link>
            {user && <Link to="/create">Create team</Link>}
            {user ? (
              <>
                <span className="nav-user">{user.name}</span>
                <button type="button" onClick={handleLogout} className="link-button">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Log in</Link>
                <Link to="/register" className="btn-nav">
                  Register
                </Link>
              </>
            )}
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Teams user={user} />} />
          <Route path="/login" element={<Login onAuth={handleAuth} />} />
          <Route path="/register" element={<Register onAuth={handleAuth} />} />
          <Route path="/teams/:id" element={<TeamDetail user={user} />} />
          <Route path="/create" element={<CreateTeam user={user} />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="brand">
              <span className="brand-mark">TF</span>
              <span className="brand-text">TeamForge</span>
            </span>
            <p>
              Team formation for hackathons with fixed-capacity teams and atomic joins — a team can
              never over-fill, and nobody can take the same seat twice.
            </p>
          </div>
          <div className="footer-col">
            <h4>Platform</h4>
            <ul>
              <li>
                <Link to="/">Browse teams</Link>
              </li>
              <li>
                <Link to="/create">Create a team</Link>
              </li>
              <li>
                <Link to="/register">Register</Link>
              </li>
              <li>
                <Link to="/login">Log in</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>About</h4>
            <p>
              Built for the Hack4Hack Crew Hiring Challenge 2026, Problem Statement 1 — race-proof
              team formation, proven by a 53-test suite and an Artillery load test.
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <span>TeamForge — Hack4Hack PS1, 2026.</span>
            <span>Joins are atomic: first come, first seated — never over capacity.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
