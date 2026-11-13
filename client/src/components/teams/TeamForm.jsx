import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import { CapacityStepper, Field, TextArea, TextInput } from '../ui/forms';
import TeamCard from './TeamCard';
import { useToast } from '../ui/Toast';

// Shared create/edit team form (Build Spec §5.5): centred card,
// name (3–50), description with a live mono counter (max 280), and the
// capacity stepper (2–12). On desktop a live TeamCard preview shows
// exactly how the team will look in the list. Validation mirrors the
// server rules; the server stays the source of truth (its
// CAPACITY_BELOW_MEMBERS verdict lands under the stepper).

export default function TeamForm({
  initial,
  user,
  minCapacity = 2,
  capacityHelper,
  submitLabel,
  cancelTo,
  onSubmit,
}) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [capacity, setCapacity] = useState(initial.capacity || 4);
  const [requireApproval, setRequireApproval] = useState(Boolean(initial.requireApproval));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  function validate() {
    const next = {};
    if (name.trim().length < 3) next.name = 'Team name must be at least 3 characters';
    if (name.trim().length > 50) next.name = 'Team name must be at most 50 characters';
    if (description.length > 280) next.description = 'Description must be at most 280 characters';
    if (capacity < minCapacity) next.capacity = `Capacity can't be below ${minCapacity}`;
    if (capacity > 12) next.capacity = 'Capacity can be at most 12';
    return next;
  }

  async function submit(e) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    setFormError('');
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        capacity,
        requireApproval,
      });
    } catch (err) {
      if (err.code === 'CAPACITY_BELOW_MEMBERS') {
        setErrors((prev) => ({
          ...prev,
          capacity: `Capacity can't go below the current ${initial.memberCount} members`,
        }));
      } else if (err.code === 'RATE_LIMITED') {
        toast.error('Too many attempts. Try again in a minute.');
      } else if (err.code === 'VALIDATION') {
        setFormError(err.message || 'Some fields need attention.');
      } else {
        setFormError(err.message || 'Something went wrong on our side.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // The preview mirrors the real card: when editing it keeps the
  // existing members and count (only the edited fields + capacity move);
  // when creating, the owner alone holds seat 1.
  const previewMembers = initial.members || [
    { id: user?.id || 'you', name: user?.name || 'You', role: 'owner' },
  ];
  const previewCount = initial.memberCount || 1;
  const previewTeam = {
    id: 'preview',
    name: name.trim() || 'Your team name',
    description: description.trim(),
    capacity,
    memberCount: previewCount,
    seatsLeft: Math.max(0, capacity - previewCount),
    isFull: capacity - previewCount <= 0,
    isMember: true,
    isOwner: true,
    owner: { id: user?.id || 'you', name: user?.name || 'You' },
    members: previewMembers,
  };

  return (
    <div className="form-layout">
      <form className="form-card" onSubmit={submit} noValidate>
        {formError && (
          <div className="form-error" role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}
        <Field id="team-name" label="Team name" error={errors.name}>
          <TextInput
            id="team-name"
            autoFocus
            placeholder="e.g. API Wizards"
            value={name}
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          id="team-description"
          label="Description"
          optional
          error={errors.description}
          hint={
            <span className="char-count" aria-live="polite">
              {description.length} / 280
            </span>
          }
        >
          <TextArea
            id="team-description"
            rows={4}
            maxLength={300}
            placeholder="What are you building, and who are you looking for?"
            value={description}
            error={errors.description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="field">
          <span className="field-label" id="capacity-label">
            Capacity
          </span>
          <CapacityStepper value={capacity} onChange={setCapacity} min={minCapacity} max={12} />
          {errors.capacity ? (
            <p className="field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              {errors.capacity}
            </p>
          ) : capacityHelper ? (
            <p className="field-hint">{capacityHelper}</p>
          ) : null}
        </div>
        <div className="field">
          <label className="checkbox-row" htmlFor="team-approval">
            <input
              id="team-approval"
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
            />
            <span>
              Require my approval before anyone joins
              <span className="field-hint" style={{ display: 'block' }}>
                Join requests wait for your review instead of taking a seat instantly.
              </span>
            </span>
          </label>
        </div>
        <div className="form-actions">
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(cancelTo)}>
            Cancel
          </Button>
        </div>
      </form>
      <div className="form-preview" aria-hidden="true">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Preview
        </p>
        <TeamCard team={previewTeam} user={user} />
      </div>
    </div>
  );
}
