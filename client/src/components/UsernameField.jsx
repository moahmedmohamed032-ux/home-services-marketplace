import { useEffect, useState } from 'react';
import { api } from '../api/axios';
import { useT } from '../i18n/useT';

// Username input with a live availability check. `value` is controlled by the parent form.
export default function UsernameField({ value, onChange }) {
  const { lang } = useT();
  const ar = lang === 'ar';
  const [state, setState] = useState('');
  useEffect(() => {
    const u = String(value || '').trim().toLowerCase();
    if (!u) { setState(''); return undefined; }
    setState('checking');
    const h = setTimeout(async () => {
      try { const { data } = await api.get('/auth/username-available', { params: { u } }); setState(!data.valid ? 'invalid' : data.available ? 'ok' : 'taken'); } catch { setState(''); }
    }, 400);
    return () => clearTimeout(h);
  }, [value]);
  const msg = { ok: ar ? '✅ متاح' : '✅ Available', taken: ar ? '❌ الاسم ده مستخدم' : '❌ Already taken', invalid: ar ? '٣ إلى ٢٤ حرف: حروف إنجليزي صغيرة وأرقام ونقطة و _' : '3-24 chars: a-z, 0-9, dot, underscore', checking: '…' }[state];
  return (
    <label>{ar ? 'اسم المستخدم' : 'Username'}
      <input required dir="ltr" autoComplete="username" maxLength={24} placeholder="ahmed.luxor" value={value} onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ''))} />
      {msg && <small className={state === 'ok' ? 'muted' : state === 'checking' ? 'muted' : 'error'}>{msg}</small>}
    </label>
  );
}
