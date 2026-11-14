import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            itp_support?: boolean;
            callback: (resp: { credential?: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: (
            momentListener?: (notification: {
              isNotDisplayed?: () => boolean;
              isSkippedMoment?: () => boolean;
              isDismissedMoment?: () => boolean;
            }) => void
          ) => void;
          disableAutoSelect?: () => void;
        };
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (err: { type: string; message?: string }) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
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
  const { showAuthModal, setShowAuthModal, googleClientId, user, theme, signInGoogle } = useApp();

  const effectiveClientId =
    googleClientId || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showAuthModal || user || !effectiveClientId) return;

    const initGsi = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: effectiveClientId,
          auto_select: true,
          itp_support: true,
          callback: async (resp) => {
            if (!resp.credential) {
              setError('Google authentication did not return a valid credential.');
              return;
            }
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
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'signin_with',
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
    script.onerror = () => {
      setError('Unable to load Google Sign-In script. Check your network connection.');
    };
    document.head.appendChild(script);
  }, [effectiveClientId, showAuthModal, signInGoogle, theme, user]);

  if (!showAuthModal || user) return null;

  const handleGoogleClick = () => {
    setError(null);
    if (!effectiveClientId) {
      setError(
        `Google OAuth Client ID (GOOGLE_CLIENT_ID) is not configured for ${window.location.origin}. Add a valid Google OAuth Web Client ID in your environment configuration with this URL in Authorized JavaScript Origins.`
      );
      return;
    }

    if (window.google?.accounts?.oauth2) {
      setLoading(true);
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: 'openid profile email',
        prompt: 'select_account',
        callback: async (resp) => {
          if (resp.error || !resp.access_token) {
            setLoading(false);
            if (resp.error && resp.error !== 'access_denied') {
              setError(resp.error_description || `Google authentication failed (${resp.error}).`);
            }
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
        error_callback: (err) => {
          setLoading(false);
          if (err.type === 'popup_failed_to_open') {
            setError('Google Sign-In popup was blocked. Please allow popups for this site and try again.');
          } else if (err.type !== 'popup_closed') {
            setError(err.message || 'Google Sign-In could not complete.');
          }
        },
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } else if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In library is unavailable. Please refresh the page and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 animate-fadeIn">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Sign in with Google
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select your Google account to continue straight to chat.
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
          {effectiveClientId && (
            <div ref={googleBtnRef} className="flex justify-center min-h-[42px]" />
          )}

          {(!effectiveClientId || !gsiReady) && (
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold transition-colors flex items-center justify-center gap-3 shadow-xs cursor-pointer disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleLogoIcon />}
              <span>Sign in with Google</span>
            </button>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2.5 leading-relaxed">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
