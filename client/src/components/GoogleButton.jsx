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
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: mode === 'login' ? 'signin_with' : 'signup_with', locale: lang === 'ar' ? 'ar' : 'en', width: 280 });
    }).catch(() => {});
    return () => { dead = true; };
  }, [clientId, mode, dispatch, lang, onSignedIn, onNeedsProfile]);
  if (!clientId) return null;
  return (
    <div className="google-auth" style={{ textAlign: 'center', margin: '12px 0' }}>
      <div ref={box} style={{ display: 'inline-block' }} />
      <p className="muted" style={{ margin: '8px 0 0' }}>{lang === 'ar' ? 'أو كمّل بالإيميل والباسورد' : 'or continue with email and password'}</p>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
