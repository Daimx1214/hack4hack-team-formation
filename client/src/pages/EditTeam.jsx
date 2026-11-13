import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { teamsApi } from '../api';
import Button from '../components/ui/Button';
import TeamForm from '../components/teams/TeamForm';
import { EmptyState, Skeleton } from '../components/ui/misc';
import { useToast } from '../components/ui/Toast';

// Edit a team (Build Spec §5.5): same form as create; the capacity
// stepper's floor is the current member count (the server enforces it
// too — a race can't shrink a team below its members). Only the owner
// gets the form; everyone else sees a clear permission state.

export default function EditTeam({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [team, setTeam] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    teamsApi
      .get(id)
      .then((data) => setTeam(data.team))
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(load, [load]);

  async function save(values) {
    const data = await teamsApi.update(id, values);
    toast.success('Team updated');
    navigate(`/teams/${data.team.id}`);
  }

  if (failed) {
    return (
      <div className="page">
        <div className="container">
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="This team could not be loaded"
            text="It may have been deleted, or the link is wrong."
            actionLabel="Browse teams"
            onAction={() => navigate('/teams')}
          />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="page">
        <div className="container" aria-label="Loading team">
          <Skeleton height={36} width={220} style={{ margin: '0 auto 24px' }} />
          <Skeleton height={420} width={560} style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (!team.isOwner) {
    return (
      <div className="page">
        <div className="container">
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="Only the owner can edit this team"
            text={`${team.owner.name} owns ${team.name}. If that's you, check you're logged in with the right account.`}
            actionLabel="Back to the team"
            onAction={() => navigate(`/teams/${team.id}`)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="h1" style={{ textAlign: 'center', marginBottom: 8 }}>
          Edit team
        </h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 32 }}>
          Changes apply straight away. Members keep their seats.
        </p>
        <TeamForm
          initial={team}
          user={user}
          minCapacity={Math.max(2, team.memberCount)}
          capacityHelper={`Capacity can't go below the current ${team.memberCount} member${team.memberCount === 1 ? '' : 's'}.`}
          submitLabel="Save changes"
          cancelTo={`/teams/${team.id}`}
          onSubmit={save}
        />
      </div>
    </div>
  );
}
