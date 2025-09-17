import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loginApi, signupApi, meApi, logoutApi, loginGoogleApi, getAuthConfig } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on first load using existing cookie
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await meApi();
        if (!cancelled) setUser(res?.user || null);
      } catch (_) {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Do not persist auth state to localStorage; rely solely on backend session

  const login = async ({ email, password }) => {
    const res = await loginApi({ email, password });
    setUser(res.user);
  };

  const signup = async ({ fullName, email, password }) => {
    const res = await signupApi({ fullName, email, password });
    setUser(res.user);
  };

  const loginWithGoogle = async () => {
    let clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    // Fallback to backend-provided config at runtime
    if (!clientId) {
      try {
        const cfg = await getAuthConfig();
        clientId = cfg?.googleClientId;
      } catch (_) {
        // ignore fetch error; we'll throw a helpful error below if still missing
      }
    }
    if (!clientId) throw new Error('Missing Google Client ID (set REACT_APP_GOOGLE_CLIENT_ID in frontend build or AUTH_GOOGLE_CLIENT_ID on backend)');
    await new Promise((resolve) => setTimeout(resolve, 0)); // next tick to ensure script is ready
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      throw new Error('Google Identity script not loaded');
    }
    // Wrap the One Tap flow to get an ID token
    const idToken = await new Promise((resolve, reject) => {
      let resolved = false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp && resp.credential) {
            resolved = true;
            resolve(resp.credential);
          } else {
            reject(new Error('No credential from Google'));
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
        ux_mode: 'popup',
      });
      // Show One Tap; if blocked, we can optionally render a button later
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: render an in-flow popup to pick account in a visible container
          try {
            const mount = document.getElementById('gsiButton') || document.createElement('div');
            if (!mount.id) {
              mount.id = 'gsiButton';
              document.body.appendChild(mount);
            }
            window.google.accounts.id.renderButton(mount, { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with', shape: 'rectangular' });
          } catch {}
          if (!resolved) {
            // User can click the rendered button; do not reject immediately
          }
        }
      });
      // As a safety, timeout after 30s
      setTimeout(() => { if (!resolved) reject(new Error('Google sign-in timed out')); }, 30000);
    });

    const res = await loginGoogleApi({ idToken });
    setUser(res.user);
  };

  const logout = async () => {
    try { await logoutApi(); } catch {}
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, signup, loginWithGoogle, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
