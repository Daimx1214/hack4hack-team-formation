import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api';

export default function Register({ onAuth }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [skills, setSkills] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await authApi.register({
        name,
        email,
        password,
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
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
      <h1>Create your account</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password (min. 6 characters)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Skills (comma separated, optional)
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="React, Node.js, MongoDB"
          />
        </label>
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Register'}
        </button>
      </form>
      <p>
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
    </div>
  );
}
