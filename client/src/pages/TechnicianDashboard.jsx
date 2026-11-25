import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchIncomingBookings, updateBookingStatus } from '../features/bookings/bookingsSlice';
import { updateMyProfile } from '../features/technicians/techniciansSlice';
import { api } from '../api/axios';
import useGeolocation from '../components/useGeolocation';
import Stars from '../components/Stars';
import { useT } from '../i18n/useT';

export default function TechnicianDashboard() {
  const dispatch = useDispatch();
  const { t } = useT();
  const user = useSelector((s) => s.auth.user);
  const incoming = useSelector((s) => s.bookings.incoming);
  const [tech, setTech] = useState(null);
  const [payments, setPayments] = useState([]);
  const loadPayments = () => api.get('/invoices/technician').then((r) => setPayments(r.data.invoices)).catch(() => {});
  const [saved, setSaved] = useState(false);
  const [locate, locating, geoError] = useGeolocation();

  useEffect(() => {
    dispatch(fetchIncomingBookings());
    api.get('/technicians/me').then((r) => setTech(r.data.technician));
    loadPayments();
  }, [dispatch]);

  const confirmCash = async (id) => { await api.post(`/invoices/${id}/confirm`); loadPayments(); };
  const payStatusKey = { paid: 'paidLabel', unpaid: 'unpaidLabel', pending_verification: 'pendingVerification', pending_cash: 'pendingCash', pending_online: 'pendingOnline' };

  if (!tech) return <p className="muted">{t('loading')}</p>;
  const set = (k, v) => { setTech({ ...tech, [k]: v }); setSaved(false); };
  const save = async () => {
    const res = await dispatch(updateMyProfile({
      phone: tech.phone, phonePublic: tech.phonePublic, addressActive: tech.addressActive, address: tech.address,
      bio: tech.bio, hourlyRate: Number(tech.hourlyRate), yearsExperience: Number(tech.yearsExperience), lat: tech.lat, lng: tech.lng,
    }));
    if (updateMyProfile.fulfilled.match(res)) { setTech(res.payload); setSaved(true); }
  };
  const count = (f) => incoming.filter(f).length;

  return (
    <>
      <section className="dash-hero">
        <div>
          <h1>▦ {t('dashboard')}</h1>
          <p>{t('welcome')}, {user.name}</p>
          <Stars rating={tech.rating} count={tech.reviewCount} />
        </div>
        <span className={`badge ${tech.addressActive ? 'badge-accepted' : 'badge-declined'}`}>
          {tech.addressActive ? t('addressActive') : t('addressInactive')}
        </span>
      </section>
      <div className="grid stat-grid">
        <div className="card stat"><strong>{count((b) => b.status === 'pending')}</strong><span>{t('pending')}</span></div>
        <div className="card stat"><strong>{count((b) => b.status === 'accepted')}</strong><span>{t('accepted')}</span></div>
        <div className="card stat"><strong>{tech.jobsDone}</strong><span>{t('jobs')}</span></div>
      </div>

      <div className="dash-cols">
        <section>
          <h2 className="section-title">{t('incoming')}</h2>
          {incoming.length === 0 && <p className="muted">{t('noRequests')}</p>}
          <div className="list">
            {incoming.map((b) => (
              <div key={b.id} className="card booking">
                <div className="booking-top">
                  <div><h3>{b.clientName}</h3><p className="muted">{b.date}</p></div>
                  <span className={`badge badge-${b.status}`}>{t(b.status)}</span>
                </div>
                <p>{b.description}</p>
                <p className="muted">📍 {b.address}
                  {b.clientLat !== undefined && <> · <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${b.clientLat},${b.clientLng}`}>{t('openMap')}</a></>}
                </p>
                <div className="btn-row">
                  {b.status === 'pending' && <>
                    <button className="btn btn-primary btn-sm" onClick={() => dispatch(updateBookingStatus({ id: b.id, status: 'accepted' }))}>{t('accept')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => dispatch(updateBookingStatus({ id: b.id, status: 'declined' }))}>{t('decline')}</button>
                  </>}
                  {b.status === 'accepted' && <button className="btn btn-primary btn-sm" onClick={() => dispatch(updateBookingStatus({ id: b.id, status: 'completed' }))}>{t('complete')}</button>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title">{t('profileSettings')}</h2>
          <div className="card form">
            <label className="check switch"><input type="checkbox" checked={tech.addressActive} onChange={(e) => set('addressActive', e.target.checked)} /> {t('activateAddress')}</label>
            <label>{t('myAddress')}<input value={tech.address || ''} onChange={(e) => set('address', e.target.value)} /></label>
            <button type="button" className="btn btn-outline" onClick={() => locate((p) => { setTech({ ...tech, ...p }); setSaved(false); })} disabled={locating}>
              📍 {locating ? t('locating') : t('detectLocation')}
            </button>
            {geoError && <p className="error">{t('locationDenied')}</p>}
            <label>{t('phone')}<input type="tel" value={tech.phone || ''} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="check switch"><input type="checkbox" checked={tech.phonePublic} onChange={(e) => set('phonePublic', e.target.checked)} />
              <span>{t('phonePublicLabel')}<br /><small className="muted">{t('phonePublicHelp')}</small></span></label>
            <label>{t('bio')}<textarea rows="3" value={tech.bio || ''} onChange={(e) => set('bio', e.target.value)} /></label>
            <div className="row">
              <label>{t('rate')}<input type="number" value={tech.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} /></label>
              <label>{t('experience')}<input type="number" value={tech.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} /></label>
            </div>
            <button className="btn btn-primary" onClick={save}>{t('save')}</button>
            {saved && <p className="notice ok">{t('saved')}</p>}
          </div>
          <h2 className="section-title">{t('paymentsSection')}</h2>
          <div className="card">
            {payments.length === 0 && <p className="muted">{t('noInvoices')}</p>}
            <div className="list">
              {payments.slice(0, 8).map((i) => (
                <div key={i.id} className="invoice-head">
                  <div><strong>{i.number}</strong> <span className="muted">· {i.clientName}</span></div>
                  <span className="invoice-total">{i.total} EGP</span>
                  <span className={`badge badge-${i.status}`}>{t(payStatusKey[i.status])}</span>
                  {i.status === 'pending_cash' && (
                    <button className="btn btn-primary btn-sm" onClick={() => confirmCash(i.id)}>{t('confirmCash')}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <h2 className="section-title">{t('clientReviews')}</h2>
          <div className="card reviews">
            {(tech.reviews || []).length === 0 && <p className="muted">{t('noReviews')}</p>}
            {(tech.reviews || []).slice(0, 5).map((r, i) => (
              <div key={i} className="review"><div className="review-head"><strong>{r.clientName}</strong><Stars rating={r.rating} /></div><p>{r.comment}</p></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
