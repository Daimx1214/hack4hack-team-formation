import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import Logo from '../ui/Logo';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import ThemeToggle from './ThemeToggle';

// Navbar (Build Spec §4): 64px sticky, blurred background, bottom border
// appears after 8px of scroll. Logged-in users get an avatar menu;
// mobile gets a hamburger + full-height sheet.

export default function Navbar({ user, onLogout }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const closeSheet = () => setSheetOpen(false);

  return (
    <header className={`navbar${scrolled ? ' scrolled' : ''}`}>
      <div className="navbar-inner">
        <Link to="/" aria-label="TeamForge home">
          <Logo />
        </Link>
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/teams" className="nav-link">
            Teams
          </NavLink>
          <NavLink to="/#how-it-works" className="nav-link">
            How it works
          </NavLink>
          {user && (
            <NavLink to="/dashboard" className="nav-link">
              My teams
            </NavLink>
          )}
        </nav>
        <div className="navbar-right">
          <ThemeToggle />
          {user ? (
            <div className="menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 'auto', height: 'auto', borderRadius: 9999 }}
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                <Avatar user={user} />
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
                    <div className="small muted">{user.email}</div>
                  </div>
                  <button
                    type="button"
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/dashboard');
                    }}
                  >
                    <LayoutDashboard /> Dashboard
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <LogOut /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="nav-auth-desktop" style={{ display: 'inline-flex', gap: 8 }}>
              <Link to="/login">
                <Button variant="ghost">Log in</Button>
              </Link>
              <Link to="/register">
                <Button>Sign up</Button>
              </Link>
            </span>
          )}
          <button
            type="button"
            className="icon-btn nav-burger"
            onClick={() => setSheetOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div className="mobile-sheet">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Logo />
            <button type="button" className="icon-btn" onClick={closeSheet} aria-label="Close menu">
              <X />
            </button>
          </div>
          <Link to="/teams" className="nav-link" onClick={closeSheet}>
            Teams
          </Link>
          <Link to="/#how-it-works" className="nav-link" onClick={closeSheet}>
            How it works
          </Link>
          {user ? (
            <>
              <Link to="/dashboard" className="nav-link" onClick={closeSheet}>
                My teams
              </Link>
              <Button
                variant="secondary"
                onClick={() => {
                  closeSheet();
                  onLogout();
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link" onClick={closeSheet}>
                Log in
              </Link>
              <Link to="/register" onClick={closeSheet}>
                <Button block>Sign up</Button>
              </Link>
            </>
          )}
          <div style={{ marginTop: 16 }}>
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
