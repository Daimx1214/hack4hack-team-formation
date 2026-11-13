import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Minus, Plus } from 'lucide-react';

// Form primitives (Build Spec §4): labelled fields with linked errors,
// a password field with show/hide + length-based strength hint, and the
// capacity stepper.

export function Field({ id, label, optional = false, error, hint, children }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ id, error, ...props }) {
  return (
    <input
      id={id}
      className="input"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  );
}

export function TextArea({ id, error, ...props }) {
  return (
    <textarea
      id={id}
      className="textarea"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  );
}

function passwordHint(password) {
  if (!password) return null;
  if (password.length < 8) return `Add ${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} (8 minimum)`;
  if (password.length < 12) return 'Good length. Longer is stronger.';
  return 'Strong length.';
}

export function PasswordInput({ id, error, showHint = false, ...props }) {
  const [visible, setVisible] = useState(false);
  const hint = showHint ? passwordHint(props.value || '') : null;
  return (
    <>
      <div className="password-wrap">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <button
          type="button"
          className="icon-btn password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {hint && !error && <p className="field-hint">{hint}</p>}
    </>
  );
}

export function CapacityStepper({ value, onChange, min = 2, max = 12 }) {
  return (
    <div>
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label="Decrease capacity"
        >
          <Minus />
        </button>
        <span className="stepper-value" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label="Increase capacity"
        >
          <Plus />
        </button>
      </div>
      <p className="field-hint">{value} seats including you</p>
    </div>
  );
}
