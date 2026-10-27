
import { useState, type FormEvent } from 'react';
import { login, register, type AuthUser } from './lib/api';
import './AuthScreen.css';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
  onBack: () => void;
}

export default function AuthScreen({
  onAuthenticated,
  onBack,
}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'DONOR' | 'RESEARCHER'>('DONOR');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const result =
        mode === 'login'
          ? await login(email.trim(), password)
          : await register(email.trim(), password, role);

      onAuthenticated(result.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <button className="auth-back" onClick={onBack} type="button">
        ← Back to STEMORA
      </button>

      <section className="auth-card">
        <div className="auth-mark">S</div>
        <div className="auth-eyebrow">STEMORA · SECURE WORKSPACE</div>

        <h1>
          {mode === 'login' ? (
            <>Welcome <span>back.</span></>
          ) : (
            <>Join <span>STEMORA.</span></>
          )}
        </h1>

        <p className="auth-description">
          {mode === 'login'
            ? 'Sign in to access your stem cell banking workspace.'
            : 'Create an account to access the STEMORA platform.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="auth-field">
              <label htmlFor="auth-role">Account type</label>
              <select
                id="auth-role"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as 'DONOR' | 'RESEARCHER')
                }
              >
                <option value="DONOR">Donor</option>
                <option value="RESEARCHER">Researcher</option>
              </select>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              placeholder={
                mode === 'register'
                  ? 'At least 8 characters'
                  : 'Enter your password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={mode === 'register' ? 8 : undefined}
              maxLength={72}
              required
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in securely →'
                : 'Create account →'}
          </button>
        </form>

        <div className="auth-security">
          <span>◆</span>
          Your credentials are verified by the STEMORA API.
        </div>
      </section>

      <p className="auth-footer">
        TRACEABILITY <span>·</span> CONSENT <span>·</span> INTEGRITY
      </p>
    </main>
  );
}
