import { useT } from '../i18n/useT';

export function VerifiedBadge({ small = false }) {
  const { t } = useT();
  return <span className={`verified-badge${small ? ' small' : ''}`} title={t('verifiedBadge')}>✔ {t('verifiedBadge')}</span>;
}

// Round profile photo, falling back to the technician's initials.
export default function TechAvatar({ tech, large = false }) {
  const cls = `avatar${large ? ' avatar-lg' : ''}`;
  if (tech.photo) return <img className={`${cls} avatar-img`} src={tech.photo} alt={tech.name} loading="lazy" />;
  return <div className={cls}>{tech.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>;
}
