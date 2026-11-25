import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../features/auth/authSlice';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, error } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ email: '', password: '' });

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const result = await dispatch(login(form));
    if (result.meta.requestStatus === 'fulfilled') {
      const dest = location.state?.from?.pathname
        || (result.payload.user.role === 'technician' ? '/pro' : '/dashboard');
      navigate(dest, { replace: true });
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <label>
          Email
          <input type="email" required value={form.email} onChange={update('email')} />
        </label>
        <label>
          Password
          <input type="password" required value={form.password} onChange={update('password')} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Logging in…' : 'Log in'}
        </button>
        {error && <p className="notice err">{error}</p>}
        <p className="muted">
          New here? <Link to="/register">Create an account</Link>
        </p>
        <div className="demo-hint">
          <strong>Demo accounts</strong>
          <span>Client: client@demo.com / Demo@1234</span>
          <span>Technician: tech@demo.com / Demo@1234</span>
        </div>
      </form>
    </div>
  );
}
