import { useState } from 'react';
import Button from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/forms';
import { useToast } from '../components/ui/Toast';
import ThemeToggle from '../components/layout/ThemeToggle';
import { authApi } from '../api';

// Settings (Build Spec §5.7, NICE): profile name, theme preference and
// "sign out everywhere". Email is shown read-only — it is the account
// identity and cannot change here.
export default function Settings({ user, onUserChange, onSignedOut }) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [confirmingOut, setConfirmingOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await authApi.updateMe({ name: name.trim() });
      onUserChange(data.user);
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(err.message || 'Something went wrong on our side.');
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    setSigningOut(true);
    try {
      await authApi.logoutAll();
    } catch {
      // Even if the call fails, end the local session — the user asked
      // to be signed out, and this device is the one we control.
    }
    onSignedOut();
  }

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 64, maxWidth: 720 }}>
      <h1 className="h1" style={{ marginBottom: 8 }}>
        Settings
      </h1>
      <p className="muted" style={{ marginBottom: 32 }}>
        Your profile, appearance and sessions.
      </p>

      <section style={{ marginBottom: 40 }}>
        <h2 className="h3" style={{ marginBottom: 16 }}>
          Profile
        </h2>
        <form onSubmit={saveProfile}>
          <Field id="settings-name" label="Name">
            <TextInput
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </Field>
          <Field id="settings-email" label="Email">
            <TextInput id="settings-email" value={user.email} disabled readOnly />
          </Field>
          <Button type="submit" disabled={saving || name.trim() === user.name}>
            {saving ? 'Saving...' : 'Save profile'}
          </Button>
        </form>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 className="h3" style={{ marginBottom: 8 }}>
          Appearance
        </h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Light, dark, or follow your system. The choice is saved on this device.
        </p>
        <ThemeToggle />
      </section>

      <section>
        <h2 className="h3" style={{ marginBottom: 8 }}>
          Sessions
        </h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Sign out on every device, including this one. Use this if you signed in
          somewhere you no longer trust.
        </p>
        {confirmingOut ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="small">Sign out everywhere?</span>
            <Button onClick={signOutEverywhere} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Yes, sign out everywhere'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingOut(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingOut(true)}>
            Sign out everywhere
          </Button>
        )}
      </section>
    </div>
  );
}
