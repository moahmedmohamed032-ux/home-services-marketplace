import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { register } from '../features/auth/authSlice';
import { fetchCities, fetchProfessions } from '../features/technicians/techniciansSlice';
import useGeolocation from '../components/useGeolocation';
import LocationError from '../components/LocationError';
import { useT } from '../i18n/useT';

export default function RegisterTechnician() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const { status, error } = useSelector((s) => s.auth);
  const { professions, cities } = useSelector((s) => s.technicians);
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', profession: '', city: '', address: '',
    yearsExperience: 1, hourlyRate: 100, bio: '', phonePublic: false, addressActive: true,
  });
  const [pos, setPos] = useState(null);
  const [locate, locating, geoError, retryLocate] = useGeolocation();
  useEffect(() => { dispatch(fetchProfessions()); dispatch(fetchCities()); }, [dispatch]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const check = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(register({ ...form, role: 'technician', ...(pos || {}) }));
    if (register.fulfilled.match(res)) navigate('/pro', { replace: true });
  };

  return (
    <div className="auth card wide">
      <h1>🔧 {t('techRegTitle')}</h1>
      <p className="muted">{t('techRegSub')}</p>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>{t('name')}<input required value={form.name} onChange={set('name')} /></label>
          <label>{t('phone')}<input type="tel" required dir="ltr" placeholder="01012345678" pattern="^(\+?20|0)?1[0125][0-9]{8}$" value={form.phone} onChange={set('phone')} /></label>
        </div>
        <div className="row">
          <label>{t('emailOptional')}<input type="email" dir="ltr" value={form.email} onChange={set('email')} /></label>
          <label>{t('password')}<input type="password" minLength={8} required value={form.password} onChange={set('password')} /></label>
        </div>
        <div className="row">
          <label>{t('profession')}
            <select required value={form.profession} onChange={set('profession')}>
              <option value="">--</option>
              {professions.map((p) => <option key={p.id} value={p.id}>{p.icon} {lang === 'ar' ? p.nameAr : p.name}</option>)}
            </select>
          </label>
          <label>{t('city')}
            <input list="cities2" required value={form.city} onChange={set('city')} />
            <datalist id="cities2">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <p className="muted comm-note">{t('phoneLoginHint')}</p>
        <label>{t('myAddress')}<input value={form.address} onChange={set('address')} /></label>
        <button type="button" className="btn btn-outline" onClick={() => locate(setPos)} disabled={locating}>
          📍 {pos ? t('locationSaved') : locating ? t('locating') : t('detectLocation')}
        </button>
        {geoError && <LocationError retry={retryLocate} loading={locating} className="error" />}
        <div className="row">
          <label>{t('experience')}<input type="number" min="0" value={form.yearsExperience} onChange={set('yearsExperience')} /></label>
          <label>{t('rate')}<input type="number" min="0" value={form.hourlyRate} onChange={set('hourlyRate')} /></label>
        </div>
        <label>{t('bio')}<textarea rows="3" value={form.bio} onChange={set('bio')} /></label>
        <label className="check"><input type="checkbox" checked={form.addressActive} onChange={check('addressActive')} /> {t('activateAddress')}</label>
        <label className="check"><input type="checkbox" checked={form.phonePublic} onChange={check('phonePublic')} /> <span>{t('phonePublicLabel')}<br /><small className="muted">{t('phonePublicHelp')}</small></span></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-accent" disabled={status === 'loading'}>{t('createTech')}</button>
      </form>
      <p className="muted">{t('haveAccount')} <Link to="/login">{t('login')}</Link> · <Link to="/register/client">{t('joinClient')}</Link></p>
    </div>
  );
}
