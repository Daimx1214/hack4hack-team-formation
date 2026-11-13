import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { authApi, hasSessionHint, setToken } from './api';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Teams from './pages/Teams';
import TeamDetail from './pages/TeamDetail';
import CreateTeam from './pages/CreateTeam';
import EditTeam from './pages/EditTeam';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import { useToast } from './components/ui/Toast';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Reset the scroll position on every navigation. Hash links (e.g.
// /#how-it-works) scroll to their anchor instead.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// The app keeps the logged-in user in state at the top level and passes
// `user` / `onAuth` down to pages. Simple prop drilling is fine at this size.
function AppShell() {
  const [user, setUser] = useState(null);
  // Protected routes wait for the restore attempt to settle before
  // deciding a visitor is a guest (no hint → settled immediately).
  const [sessionReady, setSessionReady] = useState(() => !hasSessionHint());
  const navigate = useNavigate();

  // On first load, silently restore the session: the refresh cookie is
  // the credential — exchange it for a fresh access token, then ask the
  // API who we are. Any failure just means "logged out".
  useEffect(() => {
    if (!hasSessionHint()) return;
    authApi
      .refresh()
      .then(() => authApi.me())
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setSessionReady(true));
  }, []);

  // Spec §5.8: when the API layer finds the session truly over, it
  // dispatches 'tf:session-expired' — toast and send the user to log in
  // again, returning them to where they were.
  const toast = useToast();
  useEffect(() => {
    function onSessionExpired() {
      setUser(null);
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register') {
        toast.error('Your session expired');
        navigate(`/login?returnTo=${encodeURIComponent(path)}`);
      }
    }
    window.addEventListener('tf:session-expired', onSessionExpired);
    return () => window.removeEventListener('tf:session-expired', onSessionExpired);
  }, [navigate, toast]);

  function handleAuth(data, returnTo) {
    setToken(data.accessToken);
    setUser(data.user);
    navigate(returnTo || '/teams');
  }

  function handleLogout() {
    // Revoke the refresh token server-side (fire and forget — the local
    // session ends either way).
    authApi.logout().catch(() => {});
    setToken(null);
    setUser(null);
    navigate('/');
  }

  return (
    <div className="app">
      <ScrollManager />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar user={user} onLogout={handleLogout} />
      <main id="main">
        <Routes>
          <Route path="/" element={<Landing user={user} />} />
          <Route path="/teams" element={<Teams user={user} />} />
          <Route path="/login" element={<Login user={user} onAuth={handleAuth} />} />
          <Route path="/register" element={<Register user={user} onAuth={handleAuth} />} />
          <Route
            path="/teams/new"
            element={
              <ProtectedRoute user={user} sessionReady={sessionReady}>
                <CreateTeam user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute user={user} sessionReady={sessionReady}>
                <Dashboard user={user} />
              </ProtectedRoute>
            }
          />
          <Route path="/teams/:id" element={<TeamDetail user={user} />} />
          <Route path="*" element={<NotFound />} />
          <Route
            path="/teams/:id/edit"
            element={
              <ProtectedRoute user={user} sessionReady={sessionReady}>
                <EditTeam user={user} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ThemeProvider>
  );
}
