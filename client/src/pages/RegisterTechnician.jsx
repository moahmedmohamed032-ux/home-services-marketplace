import PasswordInput from '../components/PasswordInput';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { register } from '../features/auth/authSlice';
import { fetchCities, fetchProfessions } from '../features/technicians/techniciansSlice';
import useGeolocation from '../components/useGeolocation';
import LocationError from '../components/LocationError';
import { cityLabel } from '../i18n/translations';
import { useT } from '../i18n/useT';
import { resizeImage } from '../utils/image';
import GoogleButton from '../components/GoogleButton';

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
  const [gTicket, setGTicket] = useState('');
  const [ids, setIds] = useState({ idFront: '', idBack: '', idSelfie: '' });
  const [idErr, setIdErr] = useState('');
  const ar = lang === 'ar';
  const pickId = (k) => async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { setIds((cur) => ({ ...cur, [k]: '' })); const d = await resizeImage(f, 1100, 0.7); setIds((cur) => ({ ...cur, [k]: d })); setIdErr(''); } catch { setIdErr(ar ? 'الصورة غير صالحة، جرّب صورة تانية' : 'Invalid image, try another one'); }
  };
  const band = professions.find((p) => p.id === form.profession);
  const [pos, setPos] = useState(null);
  const [locate, locating, geoError, retryLocate] = useGeolocation();
  useEffect(() => { dispatch(fetchProfessions()); dispatch(fetchCities()); }, [dispatch]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const check = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  const submit = async (e) => {
    e.preventDefault();
    if (!ids.idFront || !ids.idBack || !ids.idSelfie) { setIdErr(ar ? 'لازم ترفع صورة البطاقة (وش وضهر) وسيلفي' : 'ID front, ID back and a selfie are required'); return; }
    const res = await dispatch(register({ ...form, ...ids, role: 'technician', ...(gTicket ? { googleTicket: gTicket } : {}), ...(pos || {}) }));
    if (register.fulfilled.match(res)) navigate('/pro', { replace: true });
  };

  return (
    <div className="auth card wide">
      <h1>🔧 {t('techRegTitle')}</h1>
      <p className="muted">{t('techRegSub')}</p>
      {gTicket
        ? <p className="muted">{lang === 'ar' ? `تم التحقق من حساب جوجل (${form.email}). كمّل باقي البيانات وسجّل.` : `Google account verified (${form.email}). Fill in the rest to finish.`}</p>
        : <GoogleButton mode="technician" onNeedsProfile={(d) => { setGTicket(d.ticket); setForm((f) => ({ ...f, name: d.name, email: d.email })); }} />}
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>{t('name')}<input required value={form.name} onChange={set('name')} /></label>
          <label>{t('phone')}<input type="tel" required dir="ltr" placeholder="01012345678" pattern="^(\+?20|0)?1[0125][0-9]{8}$" value={form.phone} onChange={set('phone')} /></label>
        </div>
        <div className="row">
          <label>{t('emailOptional')}<input type="email" dir="ltr" value={form.email} onChange={set('email')} readOnly={!!gTicket} /></label>
          {!gTicket && <label>{t('password')}<PasswordInput  minLength={8} required value={form.password} onChange={set('password')} /></label>}
        </div>
        <div className="row">
          <label>{t('profession')}
            <select required value={form.profession} onChange={set('profession')}>
              <option value="">--</option>
              {professions.map((p) => <option key={p.id} value={p.id}>{p.icon} {lang === 'ar' ? p.nameAr : p.name}</option>)}
            </select>
          </label>
          <label>{t('city')}
            <select required value={form.city} onChange={set('city')}>
              <option value="">{t('chooseCity')}</option>
              {cities.map((c) => <option key={c} value={c}>{cityLabel(c, lang)}</option>)}
            </select>
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
          <label>{t('rate')}<input type="number" min="0" value={form.hourlyRate} onChange={set('hourlyRate')} />{band && <small className="muted">{t('rateHint')} {band.priceMin}-{band.priceMax} {t('perHour')}</small>}</label>
        </div>
        <label>{t('bio')}<textarea rows="3" value={form.bio} onChange={set('bio')} /></label>
        <label className="check"><input type="checkbox" checked={form.addressActive} onChange={check('addressActive')} /> {t('activateAddress')}</label>
        <label className="check"><input type="checkbox" checked={form.phonePublic} onChange={check('phonePublic')} /> <span>{t('phonePublicLabel')}<br /><small className="muted">{t('phonePublicHelp')}</small></span></label>
        <fieldset className="card id-box">
          <legend>🪪 {ar ? 'توثيق الهوية (إجباري)' : 'Identity verification (required)'}</legend>
          <p className="muted"><small>{ar ? 'بنطلب صورة البطاقة وش وضهر + سيلفي. الصور بتتشاف من إدارة FIX-IT بس، ومش بتظهر للعملاء ولا لأي حد، وبنستخدمها للتأكد من هويتك بس.' : 'We ask for the national ID (front and back) and a selfie. Only the FIX-IT admin can see them. They are never shown to customers or the public and are used only to verify who you are.'} <Link to="/privacy">{ar ? 'سياسة الخصوصية' : 'Privacy notice'}</Link></small></p>
          {[['idFront', ar ? 'البطاقة - الوش' : 'National ID - front'], ['idBack', ar ? 'البطاقة - الضهر' : 'National ID - back'], ['idSelfie', ar ? 'سيلفي' : 'Selfie']].map(([k, label]) => (
            <label key={k}>{label} {ids[k] ? '✅' : ''}<input type="file" accept="image/*" capture={k === 'idSelfie' ? 'user' : undefined} onChange={pickId(k)} /></label>
          ))}
          {idErr && <p className="error">{idErr}</p>}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-accent" disabled={status === 'loading'}>{t('createTech')}</button>
      </form>
      <p className="muted">{t('haveAccount')} <Link to="/login">{t('login')}</Link> · <Link to="/register/client">{t('joinClient')}</Link></p>
    </div>
  );
}
