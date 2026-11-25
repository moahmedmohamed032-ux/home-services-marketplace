import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/axios';
import { useT } from '../i18n/useT';

// One invoice with its (simulated) payment flow: Visa, Vodafone Cash or cash.
export default function InvoiceCard({ invoice, onChange }) {
  const { t, lang } = useT();
  const [method, setMethod] = useState(null);
  const [cardNumber, setCardNumber] = useState('');
  const [mobile, setMobile] = useState('');
  const [codeSent, setCodeSent] = useState(null); // demo: the "SMS" code
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cfg, setCfg] = useState({ provider: 'simulated', methods: [] });
  useEffect(() => { api.get('/invoices/payment-config').then((r) => setCfg(r.data)).catch(() => {}); }, []);
  const online = cfg.provider === 'paymob';
  const [done, setDone] = useState(invoice.status === 'paid' ? invoice.confirmationCode : null);

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(errorMessage(e, 'Payment failed')); }
    setBusy(false);
  };

  const pay = (body) => run(async () => {
    const { data } = await api.post(`/invoices/${invoice.id}/pay`, body);
    if (data.invoice.status === 'paid') { setDone(data.invoice.confirmationCode); setMethod(null); }
    else if (data.demoCode) setCodeSent(data.demoCode);
    onChange && onChange();
  });

  // Real payment: ask the server for a Paymob checkout and go there.
  const checkout = (m) => run(async () => {
    const { data } = await api.post(`/invoices/${invoice.id}/paymob`, { method: m, mobileNumber: mobile });
    window.location.assign(data.checkoutUrl);
  });

  const verify = () => run(async () => {
    const { data } = await api.post(`/invoices/${invoice.id}/verify`, { code });
    setDone(data.invoice.confirmationCode); setCodeSent(null); setMethod(null);
    onChange && onChange();
  });

  const printReceipt = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const rows = (invoice.items || []).map((i) => `<tr><td>${esc(lang === 'ar' && i.labelAr ? i.labelAr : i.label)}</td><td>${esc(i.amount)} EGP</td></tr>`).join('');
    w.document.write(`<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(invoice.number)}</title><style>body{font-family:sans-serif;max-width:480px;margin:2rem auto}td{padding:.4rem;border-bottom:1px solid #ddd}table{width:100%}</style></head><body><h2>FIX-IT</h2><h3>${esc(t('receiptWord'))} ${esc(invoice.number)}</h3><table>${rows}<tr><td><b>${esc(t('totalWord'))}</b></td><td><b>${esc(invoice.total)} EGP</b></td></tr></table><p>${esc(t('confirmationCode'))}: ${esc(invoice.confirmationCode || '')}</p><p>${esc(invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : '')}</p><script>window.print()<\/script></body></html>`);
    w.document.close();
  };

  const statusKey = { paid: 'paidLabel', unpaid: 'unpaidLabel', pending_verification: 'pendingVerification', pending_cash: 'pendingCash', pending_online: 'pendingOnline' }[invoice.status];

  return (
    <div className="invoice-card">
      <div className="invoice-head">
        <div>
          <strong>{t('invoice')} {invoice.number}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {(invoice.items || []).map((i) => `${lang === 'ar' && i.labelAr ? i.labelAr : i.label} (${i.amount})`).join(' + ')}
          </p>
        </div>
        <span className="invoice-total">{invoice.total} EGP</span>
        <span className={`badge badge-${invoice.status}`}>{t(statusKey)}</span>
      </div>

      {done && (
        <p className="notice ok">✓ {t('paymentDone')} · {t('confirmationCode')}: <strong dir="ltr">{done}</strong> <button className="btn btn-ghost btn-sm" onClick={printReceipt}>🧾 {t('receiptWord')}</button></p>
      )}

      {!done && online && ['unpaid', 'pending_online'].includes(invoice.status) && !method && (
        <div className="method-row">
          <span className="muted">{t('paymentMethod')}:</span>
          <button className="btn btn-primary btn-sm" onClick={() => setMethod('online-card')}>💳 {t('payCard')}</button>
          {cfg.methods.includes('wallet') && <button className="btn btn-outline btn-sm" onClick={() => setMethod('online-wallet')}>📱 {t('payWallet')}</button>}
          {invoice.status === 'unpaid' && <button className="btn btn-ghost btn-sm" onClick={() => pay({ method: 'cash' })}>💵 {t('cash')}</button>}
        </div>
      )}

      {!done && online && method && method.startsWith('online-') && (
        <div className="pay-form">
          <input dir="ltr" inputMode="tel" placeholder={t('mobileNumber') + ' (010...)'} value={mobile}
            onChange={(e) => setMobile(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => checkout(method === 'online-wallet' ? 'wallet' : 'card')}>{t('continuePay')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMethod(null)}>{t('closeBtn')}</button>
        </div>
      )}
      {!done && online && method && method.startsWith('online-') && <p className="muted">🔒 {t('secureNote')}</p>}

      {!done && !online && invoice.status === 'unpaid' && !method && (
        <div className="method-row">
          <span className="muted">{t('paymentMethod')}:</span>
          <button className="btn btn-primary btn-sm" onClick={() => setMethod('visa')}>💳 {t('visa')}</button>
          <button className="btn btn-outline btn-sm" onClick={() => setMethod('vodafone-cash')}>📱 {t('vodafoneCash')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => pay({ method: 'cash' })}>💵 {t('cash')}</button>
        </div>
      )}

      {!done && method === 'visa' && (
        <div className="pay-form">
          <input dir="ltr" inputMode="numeric" placeholder={t('cardNumber')} value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => pay({ method: 'visa', cardNumber })}>{t('payNow')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMethod(null)}>{t('closeBtn')}</button>
        </div>
      )}

      {!done && method === 'vodafone-cash' && !codeSent && (
        <div className="pay-form">
          <input dir="ltr" inputMode="tel" placeholder={t('mobileNumber') + ' (010...)'} value={mobile}
            onChange={(e) => setMobile(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => pay({ method: 'vodafone-cash', mobileNumber: mobile })}>{t('sendCode')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMethod(null)}>{t('closeBtn')}</button>
        </div>
      )}

      {!done && codeSent && (
        <>
          <p className="notice ok">📱 {t('demoCodeNote')}: <strong dir="ltr">{codeSent}</strong></p>
          <div className="pay-form">
            <input dir="ltr" inputMode="numeric" placeholder={t('enterCode')} value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={verify}>{t('verify')}</button>
          </div>
        </>
      )}

      {!done && invoice.status === 'pending_cash' && <p className="muted">💵 {t('cashAwaiting')}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
