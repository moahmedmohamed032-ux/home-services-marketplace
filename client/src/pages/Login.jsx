import PasswordInput from '../components/PasswordInput';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { login } from '../features/auth/authSlice';
import { useT } from '../i18n/useT';
import GoogleButton from '../components/GoogleButton';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, error } = useSelector((s) => s.auth);
  const { t } = useT();
  const [form, setForm] = useState({ identifier: '', password: '' });

  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(login({ identifier: form.identifier.trim(), password: form.password }));
    if (login.fulfilled.match(res)) {
      const role = res.payload.user.role;
      const home = role === 'technician' ? '/pro' : role === 'admin' ? '/admin' : '/dashboard';
      navigate(location.state?.from?.pathname && location.state.from.pathname !== '/login' ? location.state.from.pathname : home, { replace: true });
    }
  };

  const goHome = (user) => navigate(user.role === 'technician' ? '/pro' : user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
  return (
    <div className="auth card">
      <h1>{t('login')}</h1>
      <GoogleButton mode="login" onSignedIn={goHome} />
      <form onSubmit={submit} className="form">
        <label>{t('loginId')}<input required dir="ltr" autoComplete="username" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} /></label>
        <label>{t('password')}<PasswordInput  required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        {error && <p className="muted">{t('googleHint')}</p>}
        <button className="btn btn-primary" disabled={status === 'loading'}>{t('login')}</button>
      </form>
      <p className="muted">{t('noAccount')} <Link to="/register/client">{t('joinClient')}</Link> · <Link to="/register/technician">{t('joinTech')}</Link></p>
    </div>
  );
}
