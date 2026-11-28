import DisputeBox from '../components/DisputeBox';
import ProofPhotos from '../components/ProofPhotos';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../api/axios';
import InvoiceCard from '../components/InvoiceCard';
import { fetchMyBookings, reviewBooking, updateBookingStatus } from '../features/bookings/bookingsSlice';
import { useT } from '../i18n/useT';
import { fmtDateTime } from '../i18n/translations';

function ReviewForm({ booking }) {
  const dispatch = useDispatch();
  const { t } = useT();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); dispatch(reviewBooking({ id: booking.id, rating, comment })); }}>
      <strong>{t('leaveReview')}</strong>
      <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
      </select>
      <input placeholder={t('comment')} value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn btn-primary btn-sm">{t('submit')}</button>
    </form>
  );
}

export default function ClientDashboard() {
  const dispatch = useDispatch();
  const { t, lang } = useT();
  const user = useSelector((s) => s.auth.user);
  const bookings = useSelector((s) => s.bookings.mine);
  const [invoices, setInvoices] = useState([]);
  const loadInvoices = () => api.get('/invoices/mine').then((r) => setInvoices(r.data.invoices)).catch(() => {});
  useEffect(() => { dispatch(fetchMyBookings()); loadInvoices(); }, [dispatch]);

  const payFlag = new URLSearchParams(window.location.search).get('payment');
  const flagMsg = { paid: ['ok', 'paySuccess'], failed: ['error', 'payFailed'], pending: ['ok', 'payPending'] }[payFlag];
  const count = (f) => bookings.filter(f).length;
  return (
    <>
      <section className="dash-hero">
        <div>
          <h1>▦ {t('dashboard')}</h1>
          <p>{t('welcome')}, {user.name}</p>
        </div>
        <Link to="/technicians" className="btn btn-accent btn-lg">📍 {t('findTechBtn')}</Link>
      </section>
      {flagMsg && <p className={`notice ${flagMsg[0]}`} style={{ margin: '12px 0' }}>{t(flagMsg[1])}</p>}
      <div className="grid stat-grid">
        <div className="card stat"><strong>{bookings.length}</strong><span>{t('total')}</span></div>
        <div className="card stat"><strong>{count((b) => ['pending', 'accepted'].includes(b.status))}</strong><span>{t('open')}</span></div>
        <div className="card stat"><strong>{count((b) => b.status === 'completed')}</strong><span>{t('done')}</span></div>
      </div>
      <h2 className="section-title">{t('myRequests')}</h2>
      {bookings.length === 0 && <p className="muted">{t('noRequests')}</p>}
      <div className="list">
        {bookings.map((b) => (
          <div key={b.id} className="card booking">
            <div className="booking-top">
              <div><h3>{b.technicianName}</h3><p className="muted">{b.profession} · {b.date}</p><p className="muted" dir="ltr">{b.orderNo} · {fmtDateTime(b.createdAt, lang)}</p></div>
              <span className={`badge badge-${b.status}`}>{t(b.status)}</span>
            </div>
            <p>{b.description}</p>
            <p className="muted">📍 {b.address}</p>
            {b.technicianContact && (
              <div className="tech-contact">
                <strong>{t('techContact')}</strong>
                {b.technicianContact.phone && <p><a className="btn btn-primary btn-sm" href={`tel:${b.technicianContact.phone}`} dir="ltr">📞 {t('techCall')} {b.technicianContact.phone}</a></p>}
                {b.technicianContact.address && <p className="muted">📍 {b.technicianContact.address}</p>}
                {b.technicianContact.lat !== undefined ? (
                  <>
                    {b.technicianContact.distanceKm !== undefined && <p className="muted">{t('techDistance')}: {b.technicianContact.distanceKm} km</p>}
                    <iframe title="map" loading="lazy" className="tech-map" src={`https://www.openstreetmap.org/export/embed.html?bbox=${b.technicianContact.lng - 0.02}%2C${b.technicianContact.lat - 0.012}%2C${b.technicianContact.lng + 0.02}%2C${b.technicianContact.lat + 0.012}&layer=mapnik&marker=${b.technicianContact.lat}%2C${b.technicianContact.lng}`} />
                    <p><a href={`https://www.google.com/maps?q=${b.technicianContact.lat},${b.technicianContact.lng}`} target="_blank" rel="noreferrer">🗺️ {t('techMap')}</a></p>
                  </>
                ) : <p className="muted">{t('techNoLoc')}</p>}
              </div>
            )}
            {b.nearestPending && (
              <div className="confirm-box">
                <p><strong>{t('offersTitle')}</strong></p>
                {(b.offers || []).length === 0 && <p className="muted">{t('offersWaiting')}</p>}
                {(b.offers || []).map((o) => (
                  <div key={o.bookingId} className="offer-row">
                    <span><strong>{o.name}</strong> · ★ {o.rating ? o.rating.toFixed(1) : '-'}{o.distanceKm !== undefined && ` · 📍 ${o.distanceKm} km`}</span>
                    <strong>{o.hourlyRate} {t(o.rateUnit === 'trip' ? 'perTripShort' : 'perHourShort')}</strong>
                    <button className="btn btn-primary btn-sm" onClick={() => api.post(`/bookings/${o.bookingId}/choose`).then(() => dispatch(fetchMyBookings()))}>{t('pickOffer')}</button>
                  </div>
                ))}
              </div>
            )}
            {b.status === 'awaiting_confirmation' && (
              <div className="confirm-box">
                <p><strong>{t('finalAmountLabel')}: {b.finalAmount} EGP</strong></p>
                <ProofPhotos bookingId={b.id} count={b.proofCount} />
                <p className="muted"><small>{t('payToComplete')}</small></p>
                {invoices.filter((i) => i.bookingId === b.id).map((i) => (
                  <InvoiceCard key={i.id} invoice={i} onChange={loadInvoices} />
                ))}
                {b.cashAskedAt && !b.cashAnswer && (
                  <div className="notice">
                    <p><strong>{lang === 'ar' ? 'الفني قبض فلوسه؟' : 'Did the technician collect his money?'}</strong></p>
                    <div className="btn-row">
                      <button className="btn btn-primary btn-sm" onClick={() => api.post(`/bookings/${b.id}/cash-answer`, { collected: true }).then(() => { loadInvoices(); dispatch(fetchMyBookings()); })}>{lang === 'ar' ? 'أيوه دفعتله' : 'Yes, I paid'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => api.post(`/bookings/${b.id}/cash-answer`, { collected: false }).then(() => dispatch(fetchMyBookings()))}>{lang === 'ar' ? 'لأ، مادفعتش' : 'No, I did not'}</button>
                    </div>
                  </div>
                )}
                {b.cashAnswer === 'no' && <p className="muted">{lang === 'ar' ? 'بلّغنا الإدارة وهتتواصل معاك.' : 'We told the admin, who will contact you.'}</p>}
                <div className="btn-row">
                  <button className="btn btn-ghost btn-sm" onClick={() => dispatch(updateBookingStatus({ id: b.id, status: 'in_progress' })).then(() => loadInvoices())}>{t('notDone')}</button>
                </div>
              </div>
            )}
            {['pending', 'accepted'].includes(b.status) && (
              <button className="btn btn-ghost btn-sm" onClick={() => dispatch(updateBookingStatus({ id: b.id, status: 'cancelled' }))}>{t('cancel')}</button>
            )}
            {b.status === 'completed' && invoices.filter((i) => i.bookingId === b.id).map((i) => (
              <InvoiceCard key={i.id} invoice={i} onChange={loadInvoices} />
            ))}
            <DisputeBox booking={b} />
            {b.status === 'completed' && b.proofCount > 0 && <ProofPhotos bookingId={b.id} count={b.proofCount} />}
            {b.status === 'completed' && !b.review && <ReviewForm booking={b} />}
            {b.review && <p>{'★'.repeat(b.review.rating)} {b.review.comment}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
