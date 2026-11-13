import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api';

export default function Login({ onAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await authApi.login({ email, password });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
    <div className="card form-card">
      <h1>Log in</h1>
      <p className="hint">Welcome back. Demo accounts: any seed user with password demo1234.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p>
        No account yet? <Link to="/register">Register</Link>
      </p>
    </div>
    </div>
  );
}
