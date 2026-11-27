import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '../api/axios';
import { googleAuth } from '../features/auth/authSlice';
import { useT } from '../i18n/useT';

let scriptPromise;
function loadGsi() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = resolve; s.onerror = () => { scriptPromise = null; reject(new Error('gsi')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// "Continue with Google". Renders nothing until the server reports a configured client ID.
// mode: 'login' (existing accounts only), 'client' or 'technician' (sign-up).
export default function GoogleButton({ mode, onSignedIn, onNeedsProfile }) {
  const dispatch = useDispatch();
  const { lang } = useT();
  const box = useRef(null);
  const [clientId, setClientId] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/auth/google/config').then((r) => r.data.enabled && setClientId(r.data.clientId)).catch(() => {}); }, []);
  useEffect(() => {
    if (!clientId || !box.current) return undefined;
    let dead = false;
    loadGsi().then(() => {
      if (dead || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setErr('');
          const res = await dispatch(googleAuth({ credential, mode }));
          if (googleAuth.fulfilled.match(res)) {
            if (res.payload.status === 'needs_profile') onNeedsProfile?.(res.payload);
            else onSignedIn?.(res.payload.user);
          } else setErr(res.payload || 'Google sign-in failed');
        },
      });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: mode === 'login' ? 'signin_with' : 'signup_with', locale: lang === 'ar' ? 'ar' : 'en', width: Math.max(200, Math.min(400, box.current.offsetWidth || 320)) });
    }).catch(() => {});
    return () => { dead = true; };
  }, [clientId, mode, dispatch, lang, onSignedIn, onNeedsProfile]);
  if (!clientId) return null;
  const label = mode === 'login'
    ? (lang === 'ar' ? 'الدخول بحساب Google' : 'Sign in with Google')
    : (lang === 'ar' ? 'التسجيل بحساب Google' : 'Sign up with Google');
  return (
    <div className="google-auth">
      <div className="google-btn-wrap">
        <div className="google-btn-visual" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          <span>{label}</span>
        </div>
        <div ref={box} className="google-btn-hit" />
      </div>
      <div className="google-or"><span>{lang === 'ar' ? 'أو بالإيميل والباسورد' : 'or with email and password'}</span></div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
