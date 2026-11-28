import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api, errorMessage } from '../api/axios';
import { fetchCities, fetchProfessions } from '../features/technicians/techniciansSlice';
import useGeolocation from '../components/useGeolocation';
import LocationError from '../components/LocationError';
import { cityLabel } from '../i18n/translations';
import ServiceCarousel from '../components/ServiceCarousel';
import { useT } from '../i18n/useT';

// "Nearest available technician": the request goes to the 3 closest technicians of the category;
// those who accept show their price and the customer picks (see ClientDashboard).
export default function NearestRequest() {
  const { t, lang } = useT();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  const { professions, cities } = useSelector((s) => s.technicians);
  const [form, setForm] = useState({ profession: params.get('profession') || '', city: 'Luxor', date: '', description: params.get('description') || '', address: '' });
  const [pos, setPos] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locate, locating, geoError, retryLocate] = useGeolocation();
  useEffect(() => { dispatch(fetchProfessions()); dispatch(fetchCities()); }, [dispatch]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: { pathname: '/request-nearest' } } });
    setBusy(true); setMessage(null);
    try {
      await api.post('/bookings/nearest', { ...form, ...(pos ? { clientLat: pos.lat, clientLng: pos.lng } : {}) });
      setMessage({ ok: true, text: t('nearestSent') });
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (err) { setMessage({ ok: false, text: errorMessage(err, 'Failed') }); }
    setBusy(false);
  };
  return (
    <div className="card booking-form" style={{ marginTop: 16 }}>
      <h1>⚡ {t('nearestTitle')}</h1>
      <p className="muted">{t('nearestHelp')}</p>
      <form onSubmit={submit} className="form">
        <label>{t('profession')}
          <select required value={form.profession} onChange={set('profession')}>
            <option value="">-</option>
            {professions.filter((p) => p.technicianCount > 0).map((p) => <option key={p.id} value={p.id}>{p.icon} {lang === 'ar' ? p.nameAr : p.name}</option>)}
          </select>
        </label>
        <button type="button" className={`btn ${pos ? 'btn-primary' : 'btn-outline'}`} disabled={locating} onClick={() => locate((p) => setPos(p))}>
          📍 {locating ? t('locating') : pos ? `${t('nearMe')} ✓` : t('nearMe')}
        </button>
        {geoError && <LocationError retry={retryLocate} loading={locating} className="notice err" />}
        {!pos && (
          <label>{t('city')}
            <select value={form.city} onChange={set('city')}>{cities.map((c) => <option key={c} value={c}>{cityLabel(c, lang)}</option>)}</select>
          </label>
        )}
        <label>{t('date')}<input type="date" required value={form.date} onChange={set('date')} /></label>
        <label>{t('describe')}<textarea required rows="3" value={form.description} onChange={set('description')} /></label>
        <label>{t('addressLabel')}<input required value={form.address} onChange={set('address')} /></label>
        <button className="btn btn-primary" disabled={busy}>{user ? t('nearestSend') : t('login')}</button>
        {message && <p className={message.ok ? 'notice ok' : 'notice err'}>{message.text}</p>}
        {message && !message.ok && /No technician available/i.test(message.text) && <ServiceCarousel />}
      </form>
    </div>
  );
}
