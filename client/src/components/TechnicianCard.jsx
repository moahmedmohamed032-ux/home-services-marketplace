import { Link } from 'react-router-dom';
import Stars from './Stars';

export default function TechnicianCard({ technician: t, professionIcon, professionName }) {
  return (
    <Link to={`/technicians/${t.id}`} className="card tech-card">
      <div className="tech-card-head">
        <div className="avatar">{t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div>
          <h3>{t.name}</h3>
          <p className="muted">{professionIcon} {professionName || t.profession} · {t.city}</p>
        </div>
      </div>
      <Stars rating={t.rating} />
      <p className="tech-bio">{t.bio}</p>
      <div className="tech-card-foot">
        <span>{t.yearsExperience} yrs experience</span>
        <span>{t.jobsDone} jobs</span>
        {t.distanceKm !== undefined && <span className="distance">📍 {t.distanceKm} km away</span>}
        <strong>{t.hourlyRate} EGP/hr</strong>
      </div>
    </Link>
  );
}
