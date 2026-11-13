import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JoinButton from './JoinButton';
import { ToastProvider } from '../ui/Toast';
import { teamsApi } from '../../api';

// The join state machine (Build Spec §5.4): guest / available / member /
// full, plus the approval states (request to join, request sent).
vi.mock('../../api', () => ({
  teamsApi: { join: vi.fn(), get: vi.fn() },
}));

const team = (overrides = {}) => ({
  id: 'team-1',
  name: 'API Wizards',
  capacity: 4,
  memberCount: 2,
  seatsLeft: 2,
  isFull: false,
  isMember: false,
  isOwner: false,
  requireApproval: false,
  viewerApplication: null,
  ...overrides,
});

const user = { id: 'user-1', name: 'Test User', email: 'test@example.com' };

function renderButton(props) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <JoinButton onUpdate={() => {}} {...props} />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('JoinButton states', () => {
  it('sends guests to log in, with a returnTo back to this page', () => {
    renderButton({ team: team(), user: null });
    const link = screen.getByRole('link', { name: /log in to join/i });
    expect(link.getAttribute('href')).toContain('/login?returnTo=');
  });

  it('offers a plain join on an open team', () => {
    renderButton({ team: team(), user });
    expect(screen.getByRole('button', { name: 'Join team' })).toBeEnabled();
  });

  it('offers a request instead of a join on an approval team', () => {
    renderButton({ team: team({ requireApproval: true }), user });
    expect(screen.getByRole('button', { name: 'Request to join' })).toBeEnabled();
  });

  it('shows "Request sent" once an application is pending', () => {
    renderButton({ team: team({ requireApproval: true, viewerApplication: 'pending' }), user });
    expect(screen.getByRole('button', { name: 'Request sent' })).toBeDisabled();
    expect(screen.getByText('The owner will review your request.')).toBeInTheDocument();
  });

  it('shows members their "You\'re in" pill, even on a full team', () => {
    renderButton({ team: team({ isMember: true, isFull: true, seatsLeft: 0 }), user });
    expect(screen.getByRole('button', { name: /you're in/i })).toBeDisabled();
  });

  it('tells non-members a full team is full', () => {
    renderButton({ team: team({ isFull: true, seatsLeft: 0, memberCount: 4 }), user });
    expect(screen.getByRole('button', { name: 'Team is full' })).toBeDisabled();
  });

  it('joins through the API and reports the fresh team upward', async () => {
    const fresh = team({ memberCount: 3, seatsLeft: 1, isMember: true });
    teamsApi.join.mockResolvedValueOnce({ team: fresh });
    const onUpdate = vi.fn();
    render(
      <MemoryRouter>
        <ToastProvider>
          <JoinButton team={team()} user={user} onUpdate={onUpdate} />
        </ToastProvider>
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Join team' }));
    expect(teamsApi.join).toHaveBeenCalledWith('team-1');
    expect(onUpdate).toHaveBeenCalledWith(fresh);
  });
});
