import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { authApi } from '../api';
import Button from '../components/ui/Button';
import { Field, PasswordInput, TextInput } from '../components/ui/forms';
import AuthBrandPanel from '../components/layout/AuthBrandPanel';

// Login (Build Spec §5.2): two-column layout, inline validation on blur,
// generic failure message, honors ?returnTo=, logged-in visitors are
// redirected away.

export default function Login({ user, onAuth }) {
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

  function validateField(name, value) {
    if (name === 'email') {
      if (!value.trim()) return 'Email is required';
      if (!/^\S+@\S+\.\S+$/.test(value.trim())) return 'Enter a valid email address';
    }
    if (name === 'password' && !value) return 'Password is required';
    return '';
  }

  function blur(name, value) {
    setErrors((e) => ({ ...e, [name]: validateField(name, value) }));
  }

  async function submit(e) {
    e.preventDefault();
    const next = {
      email: validateField('email', email),
      password: validateField('password', password),
    };
    setErrors(next);
    if (next.email || next.password) return;
    setSubmitting(true);
    setFormError('');
    try {
      const data = await authApi.login({ email: email.trim(), password });
      onAuth(data, returnTo);
    } catch (err) {
      // One generic message by design — never reveal which field failed.
      setFormError(
        err.status === 401
          ? 'Email or password is incorrect.'
          : err.message || 'Something went wrong. Try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-form-side">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">
            Log in to join teams, manage yours, and pick up where you left off.
          </p>
          {formError && (
            <div className="form-error" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}
          <Field id="login-email" label="Email" error={errors.email}>
            <TextInput
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => blur('email', e.target.value)}
            />
          </Field>
          <Field id="login-password" label="Password" error={errors.password}>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              error={errors.password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={(e) => blur('password', e.target.value)}
            />
          </Field>
          <Button type="submit" block size="lg" loading={submitting}>
            Log in
          </Button>
          <p className="auth-alt">
            New here?{' '}
            <Link
              to={`/register${returnTo !== '/teams' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            >
              Create an account
            </Link>
          </p>
        </form>
      </div>
      <AuthBrandPanel />
    </div>
  );
}
