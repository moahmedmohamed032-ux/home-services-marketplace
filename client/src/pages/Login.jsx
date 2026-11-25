import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { login } from '../features/auth/authSlice';
import { useT } from '../i18n/useT';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, error } = useSelector((s) => s.auth);
  const { t } = useT();
  const [form, setForm] = useState({ email: '', password: '' });

  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(login(form));
    if (login.fulfilled.match(res)) {
      const home = res.payload.user.role === 'technician' ? '/pro' : '/dashboard';
      navigate(location.state?.from?.pathname && location.state.from.pathname !== '/login' ? location.state.from.pathname : home, { replace: true });
    }
  };
  const fill = (email) => setForm({ email, password: 'Demo@1234' });

  return (
    <div className="auth card">
      <h1>{t('login')}</h1>
      <form onSubmit={submit} className="form">
        <label>{t('email')}<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>{t('password')}<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={status === 'loading'}>{t('login')}</button>
      </form>
      <p className="muted">{t('noAccount')} <Link to="/register/client">{t('joinClient')}</Link> · <Link to="/register/technician">{t('joinTech')}</Link></p>
      <div className="demo">
        <strong>{t('demo')}</strong>
        <button type="button" className="chip" onClick={() => fill('client@demo.com')}>client@demo.com</button>
        <button type="button" className="chip" onClick={() => fill('tech@demo.com')}>tech@demo.com</button>
        <span className="muted">Demo@1234</span>
      </div>
    </div>
  );
}
