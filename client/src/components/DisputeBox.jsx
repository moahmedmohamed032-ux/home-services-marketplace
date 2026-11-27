import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/axios';
import { useT } from '../i18n/useT';

const ACTIVE = ['accepted', 'in_progress', 'awaiting_confirmation'];

// "I have a problem": opens a dispute that the FIX-IT admin reviews. Client and technician use the same box.
export default function DisputeBox({ booking }) {
  const { lang } = useT();
  const ar = lang === 'ar';
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const active = ACTIVE.includes(booking.status);
  const load = () => api.get(`/bookings/${booking.id}/disputes`).then((r) => setList(r.data.disputes || [])).catch(() => {});
  useEffect(() => { if (active) load(); }, [booking.id, booking.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return null;
  const openOne = list.find((d) => d.status === 'open');
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try { await api.post(`/bookings/${booking.id}/dispute`, { text }); setText(''); setOpen(false); setMsg(ar ? 'اتسجلت المشكلة والإدارة هتراجعها.' : 'Reported. The FIX-IT team will review it.'); load(); }
    catch (err) { setMsg(errorMessage(err, ar ? 'تعذر الإرسال' : 'Could not send')); } finally { setBusy(false); }
  };
  return (
    <div className="dispute-box">
      {openOne && <p className="notice">⚠️ {ar ? 'فيه مشكلة مفتوحة على الطلب ده والإدارة بتراجعها.' : 'A problem is open on this job and the team is reviewing it.'}</p>}
      {!open && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>⚠️ {ar ? 'عندي مشكلة' : 'I have a problem'}</button>}
      {open && (
        <form onSubmit={send}>
          <textarea required minLength={5} maxLength={1000} rows={3} placeholder={ar ? 'اكتب المشكلة بالتفصيل' : 'Describe the problem'} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" disabled={busy}>{ar ? 'إرسال للإدارة' : 'Send to the team'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </form>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
