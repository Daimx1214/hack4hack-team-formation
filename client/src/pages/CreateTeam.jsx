import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../api';
import TeamForm from '../components/teams/TeamForm';
import { useToast } from '../components/ui/Toast';

// Create a team (Build Spec §5.5): on success, land on the new team's
// detail page with the 'Team created' toast. Rendered only for
// logged-in users (ProtectedRoute handles the redirect).

export default function CreateTeam({ user }) {
  const navigate = useNavigate();
  const toast = useToast();

  async function create(values) {
    const data = await teamsApi.create(values);
    toast.success('Team created');
    navigate(`/teams/${data.team.id}`);
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Create a team
        </h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 32 }}>
          You take the first seat. Set the size, and the rest can join in one click.
        </p>
        <TeamForm
          initial={{ capacity: 4 }}
          user={user}
          submitLabel="Create team"
          cancelTo="/teams"
          onSubmit={create}
        />
      </div>
    </div>
  );
}
