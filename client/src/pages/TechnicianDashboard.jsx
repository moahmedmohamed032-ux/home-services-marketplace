import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchIncomingBookings, updateBookingStatus } from '../features/bookings/bookingsSlice';
import { updateMyProfile } from '../features/technicians/techniciansSlice';
import { api } from '../api/axios';
import useGeolocation from '../components/useGeolocation';
import LocationError from '../components/LocationError';
import ChatBox from '../components/ChatBox';
import Stars from '../components/Stars';
import TechAvatar, { VerifiedBadge } from '../components/TechAvatar';
import { resizeImage } from '../utils/image';
import { useT } from '../i18n/useT';

export default function TechnicianDashboard() {
  const dispatch = useDispatch();
  const { t, lang } = useT();
  const ar = lang === 'ar';
  const [comm, setComm] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [claimForm, setClaimForm] = useState({ method: 'vodafone-cash', reference: '' });
  const [idForm, setIdForm] = useState({ idFront: '', idBack: '', idSelfie: '' });
  const [idMsg, setIdMsg] = useState('');
  const loadComm = () => api.get('/technicians/me/commission').then((r) => setComm(r.data.commission || r.data)).catch(() => {});
  const user = useSelector((s) => s.auth.user);
  const incoming = useSelector((s) => s.bookings.incoming);
  const [tech, setTech] = useState(null);
  const [saveErr, setSaveErr] = useState('');
  const [amounts, setAmounts] = useState({});
  const [payments, setPayments] = useState([]);
  const loadPayments = () => api.get('/invoices/technician').then((r) => setPayments(r.data.invoices)).catch(() => {});
  const [saved, setSaved] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const [locate, locating, geoError, retryLocate] = useGeolocation();

  useEffect(() => {
    dispatch(fetchIncomingBookings());
    api.get('/technicians/me').then((r) => setTech(r.data.technician));
    loadPayments(); loadComm();
  }, [dispatch]);

  const pickIdImg = (k) => async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const d = await resizeImage(f, 1100, 0.7); setIdForm((c) => ({ ...c, [k]: d })); setIdMsg(''); } catch { setIdMsg(ar ? 'الصورة غير صالحة' : 'Invalid image'); }
  };
  const sendIdentity = async () => {
    if (!idForm.idFront || !idForm.idBack || !idForm.idSelfie) { setIdMsg(ar ? 'لازم الثلاث صور: وش وضهر وسيلفي' : 'All three photos are required'); return; }
    try { await api.post('/technicians/me/identity', idForm); setTech((c) => ({ ...c, idStatus: 'submitted' })); setIdForm({ idFront: '', idBack: '', idSelfie: '' }); setIdMsg(''); } catch { setIdMsg(ar ? 'حصلت مشكلة في الرفع، جرّب تاني' : 'Upload failed, try again'); }
  };
  const sendClaim = async () => {
    try { await api.post('/technicians/me/settlement', claimForm); setClaimForm({ ...claimForm, reference: '' }); loadComm(); } catch (e) { setIdMsg(''); alert(e.response?.data?.message || (ar ? 'حصلت مشكلة' : 'Something went wrong')); }
  };
  const confirmCash = async (id) => { await api.post(`/invoices/${id}/confirm`); loadPayments(); };
  const payStatusKey = { paid: 'paidLabel', unpaid: 'unpaidLabel', pending_verification: 'pendingVerification', pending_cash: 'pendingCash', pending_online: 'pendingOnline' };

  if (!tech) return <p className="muted">{t('loading')}</p>;
  const set = (k, v) => { setTech({ ...tech, [k]: v }); setSaved(false); };
  const save = async () => {
    const res = await dispatch(updateMyProfile({
      phone: tech.phone, phonePublic: tech.phonePublic, addressActive: tech.addressActive, address: tech.address,
      bio: tech.bio, hourlyRate: Number(tech.hourlyRate), yearsExperience: Number(tech.yearsExperience), lat: tech.lat, lng: tech.lng,
    }));
    if (updateMyProfile.fulfilled.match(res)) { setTech(res.payload); setSaved(true); setSaveErr(''); }
    else setSaveErr(String(res.payload || ''));
  };
  const count = (f) => incoming.filter(f).length;

  // Photos are resized in the browser, then saved immediately.
  const savePhotos = async (patch) => {
    setPhotoErr('');
    const res = await dispatch(updateMyProfile(patch));
    if (updateMyProfile.fulfilled.match(res)) setTech((cur) => ({ ...cur, photo: res.payload.photo, workPhotos: res.payload.workPhotos }));
    else setPhotoErr(t('photoError'));
  };
  const pickProfile = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await savePhotos({ photo: await resizeImage(f, 320, 0.8) }); } catch { setPhotoErr(t('photoError')); }
  };
  const pickWork = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await savePhotos({ workPhotos: [...(tech.workPhotos || []), await resizeImage(f, 900, 0.72)] }); } catch { setPhotoErr(t('photoError')); }
  };

  return (
    <>
      {tech.approved === false && <p className="notice">⏳ {t('pendingApprovalNote')}</p>}
      <section className="dash-hero">
        <div>
          <h1>▦ {t('dashboard')}</h1>
          <div className="photo-row"><TechAvatar tech={tech} large /><p>{t('welcome')}, {user.name} {tech.verified && <VerifiedBadge />}</p></div>
          <Stars rating={tech.rating} count={tech.reviewCount} />
        </div>
        <span className={`badge ${tech.addressActive ? 'badge-accepted' : 'badge-declined'}`}>
          {tech.addressActive ? t('addressActive') : t('addressInactive')}
        </span>
      </section>
      {tech.idStatus && !['submitted', 'approved'].includes(tech.idStatus) && (
        <section className="card id-box">
          <h3>🪪 {tech.idStatus === 'rejected' ? (ar ? 'ارفع صور الهوية تاني' : 'Please resubmit your ID photos') : (ar ? 'وثّق هويتك عشان تاخد شارة "موثّق"' : 'Verify your identity to get the verified badge')}</h3>
          <p className="muted"><small>{ar ? 'صورة البطاقة وش وضهر + سيلفي. بتتشاف من إدارة FIX-IT بس ومش بتظهر لأي عميل.' : 'National ID front and back plus a selfie. Only the FIX-IT admin sees them; never customers.'}</small></p>
          {[['idFront', ar ? 'البطاقة - الوش' : 'ID front'], ['idBack', ar ? 'البطاقة - الضهر' : 'ID back'], ['idSelfie', ar ? 'سيلفي' : 'Selfie']].map(([k, label]) => (
            <label key={k}>{label} {idForm[k] ? '✅' : ''}<input type="file" accept="image/*" capture={k === 'idSelfie' ? 'user' : undefined} onChange={pickIdImg(k)} /></label>
          ))}
          {idMsg && <p className="error">{idMsg}</p>}
          <button className="btn btn-primary" onClick={sendIdentity}>{ar ? 'ارفع للمراجعة' : 'Submit for review'}</button>
        </section>
      )}
      {tech.idStatus === 'submitted' && <p className="notice">🪪 {ar ? 'صور الهوية اتبعتت وبتتراجع.' : 'Your ID photos were submitted and are under review.'}</p>}
      {comm && comm.active && (
        <section className={`card ${comm.blocked ? 'notice' : ''}`} style={{ border: comm.outstanding > 0 ? '2px solid var(--accent, #e67e22)' : undefined }}>
          <h2 style={{ margin: 0 }}>💰 {ar ? 'مستحقات المنصة عليك' : 'Commission you owe'}: <strong style={{ fontSize: '1.6em' }}>{comm.outstanding} EGP</strong></h2>
          <p className="muted"><small>{ar ? `عمولة ${Math.round(comm.rate * 100)}% على كل شغل اتدفع كاش. لازم تتسدد خلال ${comm.overdueDays} أيام من أقدم شغلانة.` : `${Math.round(comm.rate * 100)}% on every cash job, due within ${comm.overdueDays} days of the oldest one.`} {comm.dueBy && comm.outstanding > 0 ? (ar ? 'آخر موعد: ' : 'Due by: ') + new Date(comm.dueBy).toLocaleDateString(ar ? 'ar-EG' : 'en-GB') : ''}</small></p>
          {comm.blocked && <p className="error">{ar ? 'مؤقتًا مش بتستقبل طلبات جديدة لحد ما تسدّد ونأكد الاستلام.' : 'You are not receiving new requests until you settle and we confirm.'}</p>}
          {comm.outstanding > 0 && !comm.claim && (
            <>
              <button className="btn btn-accent" style={{ width: '100%', fontSize: '1.3em', padding: '14px' }} onClick={() => setPayOpen((v) => !v)}>{ar ? 'سدد دلوقتي' : 'Pay now'} · {comm.outstanding} EGP</button>
              {payOpen && (
                <div style={{ marginTop: 12 }}>
                  <p><strong>{ar ? 'الخطوات:' : 'Steps:'}</strong></p>
                  <ol>
                    <li>{ar ? 'حوّل بالظبط' : 'Transfer exactly'} <strong dir="ltr">{comm.outstanding} EGP</strong> <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(String(comm.outstanding))}>{ar ? 'نسخ المبلغ' : 'Copy amount'}</button></li>
                    <li>{ar ? 'على: ' : 'To: '}{(comm.collection && (comm.collection.vodafoneCash || comm.collection.instapay)) ? <>
                      {comm.collection.vodafoneCash && <span dir="ltr">Vodafone Cash <strong>{comm.collection.vodafoneCash}</strong> <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(comm.collection.vodafoneCash)}>{ar ? 'نسخ' : 'Copy'}</button> </span>}
                      {comm.collection.instapay && <span dir="ltr">InstaPay <strong>{comm.collection.instapay}</strong> <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(comm.collection.instapay)}>{ar ? 'نسخ' : 'Copy'}</button></span>}</> : <strong>{ar ? 'رقم التحويل هيتعلن قريبًا' : 'transfer number will be announced soon'}</strong>}</li>
                    <li>{ar ? 'ارجع هنا واضغط "حوّلت" واكتب رقم العملية.' : 'Come back, tap "I sent it" and enter the transfer reference.'}</li>
                  </ol>
                  <div className="row">
                    <select value={claimForm.method} onChange={(e) => setClaimForm({ ...claimForm, method: e.target.value })}><option value="vodafone-cash">Vodafone Cash</option><option value="instapay">InstaPay</option></select>
                    <input placeholder={ar ? 'رقم العملية / المرجع' : 'Transfer reference'} value={claimForm.reference} onChange={(e) => setClaimForm({ ...claimForm, reference: e.target.value })} />
                    <button className="btn btn-primary btn-sm" onClick={sendClaim}>{ar ? 'حوّلت' : 'I sent it'}</button>
                  </div>
                </div>
              )}
            </>
          )}
          {comm.claim && <p className="muted">⏳ {ar ? `بلّغت بتحويل ${comm.claim.amount} جنيه، في انتظار تأكيد الإدارة.` : `You reported ${comm.claim.amount} EGP, waiting for admin confirmation.`}</p>}
          {comm.outstanding === 0 && <p className="muted">✅ {ar ? 'مفيش مستحقات عليك.' : 'Nothing due.'}</p>}
        </section>
      )}
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
                  {b.status === 'accepted' && b.dispatchId && !b.chosen && <p className="muted">{t('waitChoose')}</p>}
                  {b.status === 'accepted' && (!b.dispatchId || b.chosen) && <button className="btn btn-ghost btn-sm" onClick={() => dispatch(updateBookingStatus({ id: b.id, status: 'in_progress' }))}>{t('startJob')}</button>}
                  {['accepted', 'in_progress'].includes(b.status) && (!b.dispatchId || b.chosen) && (
                    <form className="done-form" onSubmit={(e) => { e.preventDefault(); const v = Number(amounts[b.id]); if (v > 0) dispatch(updateBookingStatus({ id: b.id, status: 'awaiting_confirmation', finalAmount: v })); }}>
                      <input type="number" min="1" placeholder={t('finalAmount')} value={amounts[b.id] || ''} onChange={(e) => setAmounts({ ...amounts, [b.id]: e.target.value })} />
                      <button className="btn btn-primary btn-sm" type="submit">{t('workDone')}</button>
                    </form>
                  )}
                  {(!b.dispatchId || b.chosen) && ['accepted', 'in_progress', 'awaiting_confirmation', 'completed'].includes(b.status) && <ChatBox booking={b} />}
                  {b.status === 'awaiting_confirmation' && <p className="muted">{t('awaitingClient')} · {b.finalAmount} EGP</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title">{t('profileSettings')}</h2>
          <div className="card form">
            <div>
              <strong>{t('profilePhoto')}</strong>
              <div className="photo-row">
                <TechAvatar tech={tech} large />
                <label className="btn btn-outline btn-sm file-btn">{tech.photo ? t('changePhoto') : t('uploadPhoto')}<input type="file" accept="image/*" onChange={pickProfile} /></label>
                {tech.photo && <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => savePhotos({ photo: '' })}>{t('removeLabel')}</button>}
              </div>
              <strong>{t('workPhotos')}</strong>
              <div className="work-gallery">
                {(tech.workPhotos || []).map((p, i) => (
                  <div key={i} className="work-item"><img src={p} alt="" /><button type="button" className="rm" aria-label={t('removeLabel')} onClick={() => savePhotos({ workPhotos: tech.workPhotos.filter((_, j) => j !== i) })}>×</button></div>
                ))}
              </div>
              {(tech.workPhotos || []).length < 6 && <label className="btn btn-outline btn-sm file-btn" style={{ marginTop: '.6rem', display: 'inline-block' }}>+ {t('addWorkPhoto')}<input type="file" accept="image/*" onChange={pickWork} /></label>}
              <p className="muted"><small>{t('photoHelp')}</small></p>
              {photoErr && <p className="error">{photoErr}</p>}
            </div>
            <label className="check switch"><input type="checkbox" checked={tech.addressActive} onChange={(e) => set('addressActive', e.target.checked)} /> {t('activateAddress')}</label>
            <label>{t('myAddress')}<input value={tech.address || ''} onChange={(e) => set('address', e.target.value)} /></label>
            <button type="button" className="btn btn-outline" onClick={() => locate((p) => { setTech({ ...tech, ...p }); setSaved(false); })} disabled={locating}>
              📍 {locating ? t('locating') : t('detectLocation')}
            </button>
            {geoError && <LocationError retry={retryLocate} loading={locating} className="error" />}
            <label>{t('phone')}<input type="tel" value={tech.phone || ''} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="check switch"><input type="checkbox" checked={tech.phonePublic} onChange={(e) => set('phonePublic', e.target.checked)} />
              <span>{t('phonePublicLabel')}<br /><small className="muted">{t('phonePublicHelp')}</small></span></label>
            <label>{t('bio')}<textarea rows="3" value={tech.bio || ''} onChange={(e) => set('bio', e.target.value)} /></label>
            <div className="row">
              <label>{t('rate')}<input type="number" value={tech.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} />{tech.priceMax && <small className="muted">{t('rateHint')} {tech.priceMin}-{tech.priceMax} {t('perHour')}</small>}</label>
              <label>{t('experience')}<input type="number" value={tech.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} /></label>
            </div>
            {saveErr && <p className="error">{saveErr}</p>}
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
