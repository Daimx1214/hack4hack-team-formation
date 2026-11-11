import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { authApi, getToken, setToken } from './api';
import Login from './pages/Login';
import Register from './pages/Register';
import Teams from './pages/Teams';
import TeamDetail from './pages/TeamDetail';
import CreateTeam from './pages/CreateTeam';

// The app keeps the logged-in user in state at the top level and passes
// `user` / `onAuth` down to pages. Simple prop drilling is fine at this size.
export default function App() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // On first load, if a token exists, ask the API who we are.
  useEffect(() => {
    if (!getToken()) return;
    authApi
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null)); // stale token — clear it
  }, []);

  function handleAuth(data) {
    setToken(data.token);
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
      <header className="nav">
        <Link to="/" className="brand">
          TeamForge
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
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
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
    </div>
  );
}
