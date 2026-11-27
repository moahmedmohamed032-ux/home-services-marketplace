import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/axios';
import { useT } from '../i18n/useT';

const POLL_MS = 4000;
const MAX = 500;

// Per-booking chat between the customer and the technician. Plain text, polled while visible
// (serverless hosting: no persistent sockets). Phone numbers are not part of it.
export default function ChatBox({ booking }) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ open: false, available: true, me: '', messages: [] });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try { const { data } = await api.get(`/bookings/${booking.id}/chat`); setState(data); } catch { /* keep last state */ }
  }, [booking.id]);

  useEffect(() => {
    if (!show) return undefined;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [show, load]);

  useEffect(() => {
    if (state.messages.length !== count.current) { count.current = state.messages.length; if (endRef.current) endRef.current.scrollIntoView({ block: 'nearest' }); }
  }, [state.messages]);

  const send = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true); setErr('');
    try { await api.post(`/bookings/${booking.id}/chat`, { text: v }); setText(''); await load(); }
    catch (ex) { setErr((ex.response && ex.response.data && ex.response.data.error && ex.response.data.error.message) || t('chatFail')); }
    finally { setBusy(false); }
  };

  return (
    <div className="chat">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(!show)}>💬 {show ? t('chatHide') : t('chatOpen')}</button>
      {show && (
        <div className="chat-box">
          <div className="chat-list">
            {!state.messages.length && <p className="muted chat-empty">{state.open ? t('chatEmpty') : t('chatNone')}</p>}
            {state.messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.from === state.me ? 'chat-mine' : 'chat-theirs'}`}>
                <span>{m.text}</span>
                <small>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          {state.open ? (
            <form className="chat-form" onSubmit={send}>
              <input value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder={t('chatPlaceholder')} />
              <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>{t('chatSend')}</button>
            </form>
          ) : <p className="muted chat-closed">{t('chatClosed')}</p>}
          {err && <p className="chat-err">{err}</p>}
          <p className="muted chat-note">{t('chatNote')}</p>
        </div>
      )}
    </div>
  );
}
