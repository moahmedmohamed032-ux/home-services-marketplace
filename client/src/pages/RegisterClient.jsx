import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { register } from '../features/auth/authSlice';
import { fetchCities } from '../features/technicians/techniciansSlice';
import useGeolocation from '../components/useGeolocation';
import LocationError from '../components/LocationError';
import { useT } from '../i18n/useT';

export default function RegisterClient() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const { status, error } = useSelector((s) => s.auth);
  const cities = useSelector((s) => s.technicians.cities);
  const [form, setForm] = useState({ name: '', email: '', password: '', city: '' });
  const [pos, setPos] = useState(null);
  const [locate, locating, geoError, retryLocate] = useGeolocation();
  useEffect(() => { dispatch(fetchCities()); }, [dispatch]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(register({ ...form, role: 'client', ...(pos || {}) }));
    if (register.fulfilled.match(res)) navigate('/dashboard', { replace: true });
  };

  return (
    <div className="auth card">
      <h1>👤 {t('clientRegTitle')}</h1>
      <p className="muted">{t('clientRegSub')}</p>
      <form onSubmit={submit} className="form">
        <label>{t('name')}<input required value={form.name} onChange={set('name')} /></label>
        <label>{t('email')}<input type="email" required value={form.email} onChange={set('email')} /></label>
        <label>{t('password')}<input type="password" minLength={8} required value={form.password} onChange={set('password')} /></label>
        <label>{t('city')}
          <input list="cities" value={form.city} onChange={set('city')} />
          <datalist id="cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <button type="button" className="btn btn-outline" onClick={() => locate(setPos)} disabled={locating}>
          📍 {pos ? t('locationSaved') : locating ? t('locating') : t('detectLocation')}
        </button>
        {geoError && <LocationError retry={retryLocate} loading={locating} className="error" />}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={status === 'loading'}>{t('createClient')}</button>
      </form>
      <p className="muted">{t('haveAccount')} <Link to="/login">{t('login')}</Link> · <Link to="/register/technician">{t('joinTech')}</Link></p>
    </div>
  );
}
