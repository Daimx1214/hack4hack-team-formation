import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../api';

export default function CreateTeam({ user }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [skillsNeeded, setSkillsNeeded] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="container">
        <p>Please log in to create a team.</p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await teamsApi.create({
        name,
        description,
        capacity: Number(capacity),
        skillsNeeded: skillsNeeded
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      navigate(`/teams/${data.team.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
    <div className="card form-card">
      <h1>Create a team</h1>
      <p className="hint">
        Capacity is fixed once the team is created — that is what lets the
        server guarantee it can never be exceeded, even under a join stampede.
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Team name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Capacity (2–10)
          <input
            type="number"
            min="2"
            max="10"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </label>
        <label>
          Skills needed (comma separated, optional)
          <input
            value={skillsNeeded}
            onChange={(e) => setSkillsNeeded(e.target.value)}
            placeholder="React, Python"
          />
        </label>
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create team'}
        </button>
      </form>
    </div>
    </div>
  );
}
