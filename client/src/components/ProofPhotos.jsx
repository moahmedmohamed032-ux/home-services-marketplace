import { useState } from 'react';
import { api } from '../api/axios';
import { useT } from '../i18n/useT';

// Photos of the finished work, attached by the technician. Loaded on demand (they are heavy).
export default function ProofPhotos({ bookingId, count }) {
  const { lang } = useT();
  const [photos, setPhotos] = useState(null);
  const [zoom, setZoom] = useState('');
  const [err, setErr] = useState('');
  if (!count) return null;
  const load = () => api.get(`/bookings/${bookingId}/proof`).then((r) => setPhotos(r.data.photos || [])).catch(() => setErr(lang === 'ar' ? 'تعذر تحميل الصور' : 'Could not load photos'));
  return (
    <div className="proof-box">
      {photos === null
        ? <button type="button" className="btn btn-outline btn-sm" onClick={load}>📷 {lang === 'ar' ? `صور إثبات الشغل (${count})` : `Proof-of-work photos (${count})`}</button>
        : (
          <div className="work-gallery proof-grid">
            {photos.map((p, i) => <img key={i} src={p} alt="" loading="lazy" onClick={() => setZoom(p)} />)}
          </div>
        )}
      {err && <p className="error">{err}</p>}
      {zoom && <div className="lightbox" onClick={() => setZoom('')}><img src={zoom} alt="" /></div>}
    </div>
  );
}
