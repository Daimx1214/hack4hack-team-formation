import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { authApi } from '../api';
import Button from '../components/ui/Button';
import { Field, PasswordInput, TextInput } from '../components/ui/forms';
import AuthBrandPanel from '../components/layout/AuthBrandPanel';

// Register (Build Spec §5.2): name 2–60, email, password 8–72 with
// show/hide and a length hint. Mirrors the server rules so the first
// round-trip rarely fails; the server stays the source of truth.
// (The old free-text "skills" field is gone — the spec's register form
// asks for name, email, password only.)

export default function Register({ user, onAuth }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = params.get('returnTo') || '/teams';

  useEffect(() => {
    if (user) navigate(returnTo, { replace: true });
  }, [user, navigate, returnTo]);

  function validateField(field, value) {
    if (field === 'name') {
      if (value.trim().length < 2) return 'Name must be at least 2 characters';
      if (value.trim().length > 60) return 'Name must be at most 60 characters';
    }
    if (field === 'email') {
      if (!value.trim()) return 'Email is required';
      if (!/^\S+@\S+\.\S+$/.test(value.trim())) return 'Enter a valid email address';
    }
    if (field === 'password') {
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (value.length > 72) return 'Password must be at most 72 characters';
    }
    return '';
  }

  function blur(field, value) {
    setErrors((e) => ({ ...e, [field]: validateField(field, value) }));
  }

  async function submit(e) {
    e.preventDefault();
    const next = {
      name: validateField('name', name),
      email: validateField('email', email),
      password: validateField('password', password),
    };
    setErrors(next);
    if (next.name || next.email || next.password) return;
    setSubmitting(true);
    setFormError('');
    try {
      const data = await authApi.register({ name: name.trim(), email: email.trim(), password });
      onAuth(data, returnTo);
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') {
        setErrors((prev) => ({
          ...prev,
          email: 'This email is already registered. Try logging in.',
        }));
      } else if (err.code === 'RATE_LIMITED') {
        setFormError('Too many attempts. Try again in a minute.');
      } else {
        setFormError(err.message || 'Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-form-side">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Name, email, password. That's all we ask.</p>
          {formError && (
            <div className="form-error" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}
          <Field id="register-name" label="Name" error={errors.name}>
            <TextInput
              id="register-name"
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => blur('name', e.target.value)}
            />
          </Field>
          <Field id="register-email" label="Email" error={errors.email}>
            <TextInput
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => blur('email', e.target.value)}
            />
          </Field>
          <Field id="register-password" label="Password" error={errors.password}>
            <PasswordInput
              id="register-password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              error={errors.password}
              showHint
              onChange={(e) => setPassword(e.target.value)}
              onBlur={(e) => blur('password', e.target.value)}
            />
          </Field>
          <Button type="submit" block size="lg" loading={submitting}>
            Create account
          </Button>
          <p className="auth-alt">
            Already have an account?{' '}
            <Link
              to={`/login${returnTo !== '/teams' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            >
              Log in
            </Link>
          </p>
        </form>
      </div>
      <AuthBrandPanel />
    </div>
  );
}
