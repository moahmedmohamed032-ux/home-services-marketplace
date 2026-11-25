import { useT } from '../i18n/useT';

export default function Stars({ rating = 0, count }) {
  const { lang } = useT();
  const full = Math.round(rating);
  return (
    <span className="stars" title={`${rating} / 5`}>
      {'★'.repeat(full)}
      <span className="stars-off">{'★'.repeat(5 - full)}</span>
      <span className="stars-num">{rating > 0 ? rating.toFixed(1) : lang === 'ar' ? 'جديد' : 'New'}</span>
      {count !== undefined && <span className="muted"> ({count})</span>}
    </span>
  );
}
