import React, { useEffect, useRef, useState } from 'react';
import { AtSign, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

function GoogleLogoIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function AuthModal() {
  const {
    showAuthModal,
    setShowAuthModal,
    googleClientId,
    user,
    signInGoogle,
    updateProfile,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  // Step 2: Preferred unique username after Google Sign-In
  const [usernameInput, setUsernameInput] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    if (user && !user.username && showAuthModal) {
      const suggested = user.name
        .replace(/[^a-zA-Z0-9_ .-]/g, '')
        .trim()
        .slice(0, 24);
      setUsernameInput((prev) => prev || suggested);
      setError(null);
    }
  }, [showAuthModal, user]);

  useEffect(() => {
    if (!showAuthModal || !user || user.username) return;
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setUsernameStatus(null);
      return;
    }
    let cancelled = false;
    setCheckingUsername(true);
    const timer = window.setTimeout(() => {
      api
        .checkUsernameAvailable(trimmed)
        .then((res) => {
          if (!cancelled) {
            setUsernameStatus({ available: res.available, reason: res.reason });
          }
        })
        .catch(() => {
          if (!cancelled) setUsernameStatus(null);
        })
        .finally(() => {
          if (!cancelled) setCheckingUsername(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showAuthModal, user, usernameInput]);

  useEffect(() => {
    if (!showAuthModal || user || !googleClientId) return;

    const initGsi = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (resp) => {
            if (!resp.credential) return;
            setLoading(true);
            setError(null);
            try {
              await signInGoogle({ idToken: resp.credential });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
            } finally {
              setLoading(false);
            }
          },
        });
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width: 340,
        });
        setGsiReady(true);
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', initGsi);
      return () => existingScript.removeEventListener('load', initGsi);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGsi;
    document.head.appendChild(script);
  }, [googleClientId, showAuthModal, signInGoogle, user]);

  if (!showAuthModal) return null;

  const handleGoogleFallbackClick = () => {
    setError(null);
    if (!googleClientId) {
      setError(
        'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID in AI Studio Settings > Secrets to enable live Google Sign-In.'
      );
      return;
    }
    if (window.google?.accounts?.oauth2) {
      setLoading(true);
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'openid profile email',
        callback: async (resp) => {
          if (resp.error || !resp.access_token) {
            setError('Google Sign-In was canceled or unavailable.');
            setLoading(false);
            return;
          }
          try {
            await signInGoogle({ accessToken: resp.access_token });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
          } finally {
            setLoading(false);
          }
        },
      });
      client.requestAccessToken();
    } else if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In script is still loading. Please try again.');
    }
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setError('Please enter your preferred username.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updateProfile({ username: trimmed });
      setShowAuthModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save username.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: User is signed in with Google and setting their unique username
  if (user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 animate-fadeIn">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500 dark:text-sky-400" />
                <span>Choose Your Username</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Personalize your greeting and unique identity across MindMaster AI.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 mb-5">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveUsername} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Preferred Username
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="e.g. Lasin"
                  autoFocus
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                {checkingUsername ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                ) : usernameStatus?.available ? (
                  <Check className="w-4 h-4 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2" />
                ) : null}
              </div>

              {usernameStatus && !checkingUsername && (
                <p
                  className={`text-xs mt-1.5 ${
                    usernameStatus.available
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {usernameStatus.available
                    ? `"${usernameInput.trim()}" is available.`
                    : usernameStatus.reason}
                </p>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || (usernameStatus !== null && !usernameStatus.available)}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save Username</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Google Sign-In Only
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 animate-fadeIn">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Welcome to MindMaster AI
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Sign in or register instantly with your Google account to sync chats, custom usernames, and daily image credits.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAuthModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {googleClientId && (
            <div ref={googleBtnRef} className="flex justify-center min-h-[42px]" />
          )}

          {(!googleClientId || !gsiReady) && (
            <button
              type="button"
              onClick={handleGoogleFallbackClick}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold transition-colors flex items-center justify-center gap-3 shadow-xs cursor-pointer disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleLogoIcon />}
              <span>Continue with Google</span>
            </button>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2.5 leading-relaxed">
              {error}
            </p>
          )}

          <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 leading-relaxed">
            Anyone with a Google account can sign in immediately. Your Google profile name, email, and avatar are retrieved automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
