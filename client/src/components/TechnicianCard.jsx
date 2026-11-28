import { Link } from 'react-router-dom';
import Stars from './Stars';
import TechAvatar, { VerifiedBadge } from './TechAvatar';
import { useT } from '../i18n/useT';
import { cityLabel } from '../i18n/translations';

export default function TechnicianCard({ technician: t, professionIcon, professionName }) {
  const { t: tr, lang } = useT();
  return (
    <Link to={`/technicians/${t.id}`} className="card tech-card">
      <div className="tech-card-head">
        <TechAvatar tech={t} />
        <div>
          <div className="tech-name-line"><h3>{t.name}</h3>{t.verified && <VerifiedBadge small />}</div>
          <p className="muted">{professionIcon} {professionName || t.profession} · {t.district ? `${t.district}, ` : ''}{cityLabel(t.city, lang)}</p>
        </div>
      </div>
      <Stars rating={t.rating} count={t.reviewCount} />
      <p className="tech-bio">{lang === 'ar' && t.bioAr ? t.bioAr : t.bio}</p>
      <div className="tech-card-foot">
        <span>{t.yearsExperience} {tr('years')}</span>
        {t.distanceKm !== undefined && <span className="distance">📍 {t.distanceKm} {tr('away')}</span>}
        <strong>{t.hourlyRate} {tr(t.rateUnit === 'trip' ? 'perTrip' : 'perHour')}</strong>
        {t.priceStatus === 'within' && <span className="price-ok" title={`${t.priceMin}-${t.priceMax}`}>✓ {tr('priceWithin')}</span>}
      </div>
    </Link>
  );
}
