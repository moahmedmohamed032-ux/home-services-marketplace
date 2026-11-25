import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchTechnician } from '../features/technicians/techniciansSlice';
import { createBooking } from '../features/bookings/bookingsSlice';
import Stars from '../components/Stars';
import TechAvatar, { VerifiedBadge } from '../components/TechAvatar';
import { cityLabel } from '../i18n/translations';
import { useT } from '../i18n/useT';

export default function TechnicianDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const { current: tech } = useSelector((s) => s.technicians);
  const { user } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ date: '', description: '', address: '' });
  const [shareLoc, setShareLoc] = useState(true);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [zoom, setZoom] = useState(null);

  useEffect(() => { dispatch(fetchTechnician(id)); }, [dispatch, id]);
  if (!tech || tech.id !== id) return <p className="muted">{t('loading')}</p>;

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: { pathname: `/technicians/${id}` } } });
    setSubmitting(true); setMessage(null);
    let coords = {};
    if (shareLoc && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
        coords = { clientLat: pos.coords.latitude, clientLng: pos.coords.longitude };
      } catch { coords = {}; }
    }
    const result = await dispatch(createBooking({ technicianId: id, ...form, ...coords }));
    setSubmitting(false);
    if (result.meta.requestStatus === 'fulfilled') {
      setMessage({ ok: true, text: '✓' });
      setForm({ date: '', description: '', address: '' });
      setTimeout(() => navigate('/dashboard'), 900);
    } else setMessage({ ok: false, text: result.payload });
  };

  const reviews = tech.reviews || [];
  return (
    <div className="details-layout">
      <div>
        <div className="card tech-profile">
          <div className="tech-card-head">
            <TechAvatar tech={tech} large />
            <div>
              <div className="tech-name-line"><h1>{tech.name}</h1>{tech.verified && <VerifiedBadge />}</div>
              <p className="muted">{tech.district ? `${tech.district}, ` : ''}{cityLabel(tech.city, lang)} · {tech.yearsExperience} {t('years')}</p>
            </div>
          </div>
          <Stars rating={tech.rating} count={tech.reviewCount} />
          <p>{lang === 'ar' && tech.bioAr ? tech.bioAr : tech.bio}</p>
          <div className="stats-row">
            <div><strong>{tech.jobsDone}</strong><span>{t('jobs')}</span></div>
            <div><strong>{tech.hourlyRate}</strong><span>{t('perHour')}</span>{tech.priceStatus === 'within' && <span className="price-ok">✓ {t('priceWithin')} ({tech.priceMin}-{tech.priceMax})</span>}</div>
            <div><strong>{tech.rating ? tech.rating.toFixed(1) : '-'}</strong><span>{t('rating')}</span></div>
          </div>
          <p className="phone-line">
            📞 {tech.phone ? <a href={`tel:${tech.phone}`} dir="ltr">{tech.phone}</a> : <span className="muted">{t('phoneHidden')}</span>}
          </p>
        </div>

        {(tech.workPhotos || []).length > 0 && (
          <div className="card">
            <h2>{t('workGallery')}</h2>
            <div className="work-gallery">
              {tech.workPhotos.map((p, i) => <img key={i} src={p} alt={`${tech.name} ${i + 1}`} loading="lazy" onClick={() => setZoom(p)} />)}
            </div>
          </div>
        )}
        {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={zoom} alt="" /></div>}

        <div className="card reviews">
          <h2>{t('clientReviews')} ({reviews.length})</h2>
          {reviews.length === 0 && <p className="muted">{t('noReviews')}</p>}
          {reviews.map((r, i) => (
            <div key={i} className="review">
              <div className="review-head"><strong>{r.clientName}</strong><Stars rating={r.rating} /></div>
              {(lang === 'ar' && r.commentAr ? r.commentAr : r.comment) && <p>{lang === 'ar' && r.commentAr ? r.commentAr : r.comment}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="card booking-form">
        <h2>{t('book')}</h2>
        {user?.role === 'technician' ? (
          <p className="muted">{t('joinClient')}</p>
        ) : (
          <form onSubmit={submit} className="form">
            <label>{t('date')}<input type="date" required value={form.date} onChange={update('date')} /></label>
            <label>{t('describe')}<textarea required rows="3" value={form.description} onChange={update('description')} /></label>
            <label>{t('addressLabel')}<input required value={form.address} onChange={update('address')} /></label>
            <label className="check"><input type="checkbox" checked={shareLoc} onChange={(e) => setShareLoc(e.target.checked)} /> {t('attachLocation')}</label>
            <button className="btn btn-primary" disabled={submitting}>{user ? t('bookNow') : t('login')}</button>
            {message && <p className={message.ok ? 'notice ok' : 'notice err'}>{message.text}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
