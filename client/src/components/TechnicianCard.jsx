import { Link } from 'react-router-dom';
import Stars from './Stars';
import { useT } from '../i18n/useT';

export default function TechnicianCard({ technician: t, professionIcon, professionName }) {
  const { t: tr, lang } = useT();
  return (
    <Link to={`/technicians/${t.id}`} className="card tech-card">
      <div className="tech-card-head">
        <div className="avatar">{t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div>
          <h3>{t.name}</h3>
          <p className="muted">{professionIcon} {professionName || t.profession} · {t.district ? `${t.district}, ` : ''}{t.city}</p>
        </div>
      </div>
      <Stars rating={t.rating} count={t.reviewCount} />
      <p className="tech-bio">{lang === 'ar' && t.bioAr ? t.bioAr : t.bio}</p>
      <div className="tech-card-foot">
        <span>{t.yearsExperience} {tr('years')}</span>
        {t.distanceKm !== undefined && <span className="distance">📍 {t.distanceKm} {tr('away')}</span>}
        <strong>{t.hourlyRate} {tr('perHour')}</strong>
      </div>
    </Link>
  );
}
