import { useState, useRef, useEffect } from 'react';

const SUGGEST = ['إزاي أحجز فني؟', 'العمولة كام؟', 'ليه بتطلبوا صورة البطاقة؟', 'الدفع بيتم إزاي؟'];
const linkify = (text) => text.split(/(https?:\/\/\S+)/g).map((p, i) => (/^https?:\/\//.test(p)
  ? <a key={i} href={p} target="_blank" rel="noreferrer">{p.includes('wa.me') ? 'واتساب الدعم' : p}</a> : p));

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState([{ from: 'bot', text: 'أهلاً! أنا مساعد FIX-IT. اسألني عن الحجز، الدفع، العمولة، توثيق الفنيين أو الخصوصية. بجاوب من معلومات المنصة بس. متكتبش بيانات خاصة (رقم موبايل أو عنوان).' }]);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open]);

  async function send(q) {
    q = (q ?? text).trim();
    if (!q || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { from: 'me', text: q }]);
    try {
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q }) });
      const j = await r.json();
      setMsgs((m) => [...m, { from: 'bot', text: j.answer || j.error?.message || 'حصلت مشكلة، جرب تاني.' }]);
    } catch {
      setMsgs((m) => [...m, { from: 'bot', text: 'حصلت مشكلة في الاتصال، جرب تاني.' }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="asst" dir="rtl">
      {open && (
        <div className="asst-panel" role="dialog" aria-label="مساعد FIX-IT">
          <div className="asst-head"><div className="asst-title"><span className="asst-avatar">🤖</span><div><strong>مساعد FIX-IT</strong><small>بيجاوب من معلومات المنصة بس</small></div></div><button type="button" className="asst-x" aria-label="إغلاق" onClick={() => setOpen(false)}>×</button></div>
          <div className="asst-body">
            {msgs.map((m, i) => <div key={i} className={`asst-msg asst-${m.from}`}>{linkify(m.text)}</div>)}
            {msgs.length === 1 && <div className="asst-sug">{SUGGEST.map((s) => <button type="button" key={s} onClick={() => send(s)}>{s}</button>)}</div>}
            {busy && <div className="asst-msg asst-bot">بكتب...</div>}
            <div ref={end} />
          </div>
          <form className="asst-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="اكتب سؤالك..." aria-label="سؤالك" />
            <button type="submit" disabled={busy || !text.trim()}>إرسال</button>
          </form>
        </div>
      )}
      <button type="button" className="asst-fab" onClick={() => setOpen((o) => !o)} aria-label="مساعد FIX-IT">{open ? '×' : <><span className="asst-ico">✨</span>اسأل مساعد FIX-IT</>}</button>
    </div>
  );
}
