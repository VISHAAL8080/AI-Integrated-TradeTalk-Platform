import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';


export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (e) {
      setError('Failed to login.');
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authLayout">
      <div className="authIllustration" aria-hidden>
        <div className="authCircle">
          <span className="authEmoji" role="img" aria-label="learning">📖</span>
        </div>
      </div>
      <div className="authPanel">
        <div className="authCard">
          <h1 className="authTitle">Log in with email</h1>
          {error && <div className="errorBox" style={{ marginTop: 12 }}>{error}</div>}

          <form onSubmit={onSubmit} className="authForm">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="btnPrimary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
              {loading ? 'Logging in…' : 'Continue'}
            </button>
          </form>

          <div className="orDivider"><span>Other login options</span></div>
          <button className="btnGoogle" onClick={onGoogle} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.7 3l5.7-5.7C33.8 6.3 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.9 16.3 19.1 14 24 14c3 0 5.7 1.1 7.7 3l5.7-5.7C33.8 6.3 29.2 4 24 4 16.4 4 9.8 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2C29.1 34.8 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.7 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.4-2.8 4.4-5.1 5.7l-.1.1 6.2 5.2c-.4.3 7.4-4.7 7.4-14 0-1.2-.1-2.3-.4-3.5z"/></svg>
            <span>Continue with Google</span>
          </button>

          <div className="authAlt">
            Don&apos;t have an account? <Link to="/signup" className="link">Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
