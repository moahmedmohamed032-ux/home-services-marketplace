import PasswordInput from '../components/PasswordInput';
import { useState } from 'react';
import { api, errorMessage } from '../api/axios';

export default function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (form.newPassword !== form.confirm) { setErr('كلمتا المرور غير متطابقتين'); return; }
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setMsg('تم تغيير كلمة المرور بنجاح');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (ex) {
      setErr(errorMessage(ex));
    }
  };

  return (
    <div className="auth card">
      <h1>تغيير كلمة المرور</h1>
      <form onSubmit={submit} className="form">
        <label>كلمة المرور الحالية<PasswordInput id="cp-current" name="current-password"  required autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} /></label>
        <label>كلمة المرور الجديدة<PasswordInput id="cp-new" name="new-password"  required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} /></label>
        <label>تأكيد كلمة المرور الجديدة<PasswordInput id="cp-confirm" name="confirm-password"  required minLength={8} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></label>
        {err && <p className="error">{err}</p>}
        {msg && <p className="muted" id="cp-ok">{msg}</p>}
        <button className="btn btn-primary">حفظ</button>
      </form>
    </div>
  );
}
