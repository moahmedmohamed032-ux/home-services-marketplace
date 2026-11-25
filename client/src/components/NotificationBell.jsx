import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../api/axios';
import { useT } from '../i18n/useT';

const POLL_MS = 20000;
const TOAST_MS = 5000;

// Bell + dropdown history in the navbar, and non-blocking toasts that dismiss
// themselves after a few seconds. Polls the API (serverless: no websockets).
export default function NotificationBell() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const seen = useRef(new Set());
  const first = useRef(true);

  const pick = (n, key) => (lang === 'ar' ? n[`${key}Ar`] : n[`${key}En`]) || n[`${key}Ar`] || '';

  const dismiss = useCallback((id) => setToasts((x) => x.filter((y) => y.id !== id)), []);

  const poll = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const { data } = await api.get('/notifications');
      setItems(data.notifications);
      setUnread(data.unread);
      const fresh = data.notifications.filter((n) => !n.read && !seen.current.has(n.id));
      data.notifications.forEach((n) => seen.current.add(n.id));
      first.current = false;
      if (fresh.length) {
        const show = fresh.slice(0, 3).reverse();
        setToasts((x) => [...x, ...show].slice(-3));
        show.forEach((n) => setTimeout(() => dismiss(n.id), TOAST_MS));
      }
    } catch (e) { /* offline or logged out: stay quiet */ }
  }, [dismiss]);

  useEffect(() => {
    if (!user) return undefined;
    seen.current = new Set();
    first.current = true;
    poll();
    const id = setInterval(poll, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [user, poll]);

  if (!user) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try { await api.post('/notifications/read', {}); setUnread(0); setItems((x) => x.map((n) => ({ ...n, read: true }))); } catch (e) { /* ignore */ }
    }
  };
  const go = (n) => { setOpen(false); dismiss(n.id); if (n.link) navigate(n.link); };
  const when = (iso) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      <div className="notif-wrap">
        <button type="button" className="icon-btn notif-btn" onClick={toggle} aria-label={t('notifications')} title={t('notifications')}>
          🔔{unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        {open && (
          <div className="notif-panel card">
            <strong>{t('notifications')}</strong>
            {items.length === 0 && <p className="muted">{t('noNotifications')}</p>}
            {items.map((n) => (
              <button type="button" key={n.id} className={`notif-item${n.read ? '' : ' unread'}`} onClick={() => go(n)}>
                <b>{pick(n, 'title')}</b>
                {pick(n, 'body') && <span>{pick(n, 'body')}</span>}
                <small className="muted">{when(n.createdAt)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {createPortal(
        <div className="toast-stack" aria-live="polite">
          {toasts.map((n) => (
            <div key={n.id} className="toast" role="status" onClick={() => go(n)}>
              <b>{pick(n, 'title')}</b>
              {pick(n, 'body') && <span>{pick(n, 'body')}</span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
