import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { register } from '../features/auth/authSlice';
import { fetchProfessions } from '../features/technicians/techniciansSlice';

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status, error } = useSelector((s) => s.auth);
  const { professions } = useSelector((s) => s.technicians);

  const [form, setForm] = useState({
    name: '', email: '', password: '', city: '',
    role: searchParams.get('role') === 'technician' ? 'technician' : 'client',
    profession: '', yearsExperience: '', hourlyRate: '', bio: '',
  });

  useEffect(() => {
    dispatch(fetchProfessions());
  }, [dispatch]);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (payload.role === 'client') {
      delete payload.profession;
      delete payload.yearsExperience;
      delete payload.hourlyRate;
      delete payload.bio;
    }
    const result = await dispatch(register(payload));
    if (result.meta.requestStatus === 'fulfilled') {
      navigate(result.payload.user.role === 'technician' ? '/pro' : '/dashboard', { replace: true });
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Create your account</h1>

        <div className="role-switch">
          {['client', 'technician'].map((r) => (
            <button
              key={r}
              type="button"
              className={`btn ${form.role === r ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setForm({ ...form, role: r })}
            >
              {r === 'client' ? 'I need a technician' : 'I am a technician'}
            </button>
          ))}
        </div>

        <label>
          Full name
          <input type="text" required value={form.name} onChange={update('name')} />
        </label>
        <label>
          Email
          <input type="email" required value={form.email} onChange={update('email')} />
        </label>
        <label>
          Password (min 8 characters)
          <input type="password" required minLength="8" value={form.password} onChange={update('password')} />
        </label>
        <label>
          City
          <input type="text" required value={form.city} onChange={update('city')} />
        </label>

        {form.role === 'technician' && (
          <>
            <label>
              Profession
              <select required value={form.profession} onChange={update('profession')}>
                <option value="">Choose…</option>
                {professions.map((p) => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label>
                Years of experience
                <input type="number" min="0" value={form.yearsExperience} onChange={update('yearsExperience')} />
              </label>
              <label>
                Hourly rate (EGP)
                <input type="number" min="0" value={form.hourlyRate} onChange={update('hourlyRate')} />
              </label>
            </div>
            <label>
              Short bio
              <textarea rows="3" value={form.bio} onChange={update('bio')} />
            </label>
          </>
        )}

        <button className="btn btn-primary" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Creating…' : 'Create account'}
        </button>
        {error && <p className="notice err">{error}</p>}
        <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
