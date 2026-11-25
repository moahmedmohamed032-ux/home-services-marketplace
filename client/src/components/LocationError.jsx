import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT';

// Shows the location error with a retry button. If the browser has blocked
// permission for good, explains how to re-enable it in browser settings.
export default function LocationError({ retry, loading, className = 'error' }) {
  const { t } = useT();
  const [blocked, setBlocked] = useState(false);
  const check = () => {
    if (!navigator.permissions?.query) return;
    navigator.permissions.query({ name: 'geolocation' })
      .then((r) => setBlocked(r.state === 'denied')).catch(() => {});
  };
  useEffect(check, []);
  const onRetry = () => { retry(); setTimeout(check, 1500); };
  return (
    <div className={className} role="alert">
      <p style={{ margin: '0 0 8px' }}>{t('locationDenied')}</p>
      <button type="button" className="btn btn-outline" onClick={onRetry} disabled={loading}>
        📍 {t('enableLocation')}
      </button>
      {blocked && <p style={{ margin: '8px 0 0', fontSize: '0.9em' }}>{t('locationBlockedHelp')}</p>}
    </div>
  );
}
