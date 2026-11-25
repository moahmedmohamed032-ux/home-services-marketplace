import PasswordInput from '../components/PasswordInput';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../api/axios';
import { useT } from '../i18n/useT';
import { VerifiedBadge } from '../components/TechAvatar';

const BOOKING_STATUSES = ['pending', 'accepted', 'declined', 'completed', 'cancelled'];
const emptyTech = { name: '', email: '', password: '', profession: '', city: '', district: '', phone: '', rating: '', hourlyRate: '' };

// Admin-only dashboard: overview plus full create / edit / delete for
// technicians, users, bookings and invoices.
export default function AdminDashboard() {
  const { t, lang } = useT();
  const user = useSelector((s) => s.auth.user);
  const [tab, setTab] = useState('technicians');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [techs, setTechs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [comm, setComm] = useState(null);
  const [professions, setProfessions] = useState([]);
  const [modal, setModal] = useState(null); // { kind, mode, data }
  const [pendingDel, setPendingDel] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    api.get('/admin/overview').then((r) => setOverview(r.data.overview)).catch(() => {});
    api.get('/admin/users').then((r) => setUsers(r.data.users)).catch(() => {});
    api.get('/admin/technicians').then((r) => setTechs(r.data.technicians)).catch(() => {});
    api.get('/admin/bookings').then((r) => setBookings(r.data.bookings)).catch(() => {});
    api.get('/admin/invoices').then((r) => setInvoices(r.data.invoices)).catch(() => {});
    api.get('/admin/commissions').then((r) => setComm(r.data.commissions)).catch(() => {});
    api.get('/professions').then((r) => setProfessions(r.data.professions)).catch(() => {});
  };
  useEffect(load, []);

  const run = async (fn) => {
    setErr(''); setMsg('');
    try { const m = await fn(); setMsg(m === 'deleted' ? t('adminDeleted') : t('adminSaved')); setModal(null); load(); }
    catch (e) { setErr((e.response && e.response.data && e.response.data.error && e.response.data.error.message) || t('adminError')); }
  };
  const del = (path) => setPendingDel(path);
  const confirmDel = () => { const path = pendingDel; setPendingDel(null); run(() => api.delete(path).then(() => 'deleted')); };

  const payStatusKey = { paid: 'paidLabel', unpaid: 'unpaidLabel', pending_verification: 'pendingVerification', pending_cash: 'pendingCash', pending_online: 'pendingOnline' };
  const methodLabel = (m) => (m === 'visa' || m === 'card' ? t('visa') : m === 'vodafone-cash' || m === 'wallet' ? t('vodafoneCash') : m === 'cash' ? t('cash') : '-');
  const profName = (id) => { const p = professions.find((x) => x.id === id); return p ? (lang === 'ar' ? p.nameAr : p.name) : id; };
  const roleLabel = (r) => (r === 'client' ? t('clientsWord') : r === 'technician' ? t('techniciansWord') : t('admin'));
  const setF = (k) => (e) => setModal((m) => ({ ...m, data: { ...m.data, [k]: e.target.value } }));

  const submit = (e) => {
    e.preventDefault();
    const { kind, mode, data } = modal;
    if (kind === 'tech') {
      const body = { name: data.name, profession: data.profession, city: data.city, district: data.district, phone: data.phone, rating: data.rating, hourlyRate: data.hourlyRate };
      if (mode === 'add') return run(() => api.post('/admin/technicians', { ...body, email: data.email, password: data.password }));
      return run(() => api.patch(`/admin/technicians/${data.id}`, body));
    }
    if (kind === 'user') return run(() => api.patch(`/admin/users/${data.id}`, { name: data.name, role: data.role, city: data.city }));
    if (kind === 'booking') return run(() => api.patch(`/admin/bookings/${data.id}`, { status: data.status }));
    if (kind === 'invoice') {
      return run(() => api.patch(`/admin/invoices/${data.id}`, { items: [data.a, data.b], status: data.status === 'paid' ? 'paid' : 'unpaid' }));
    }
  };

  const openInvoice = (i) => setModal({ kind: 'invoice', mode: 'edit', data: { id: i.id, a: (i.items[0] || {}).amount ?? 0, b: (i.items[1] || {}).amount ?? 0, status: i.status === 'paid' ? 'paid' : 'unpaid', number: i.number } });
  const toggleUser = (u) => run(() => api.patch(`/admin/users/${u.id}`, { active: u.active === false }));
  const togglePaid = (i) => run(() => api.patch(`/admin/invoices/${i.id}`, { status: i.status === 'paid' ? 'unpaid' : 'paid' }));

  const tabs = [['technicians', t('techniciansWord'), techs.length], ['users', t('usersWord'), users.length], ['bookings', t('bookingsWord'), bookings.length], ['invoices', t('invoices'), invoices.length], ['commission', t('commissionsTab'), comm ? comm.totals.jobs : 0]];

  return (
    <>
      <section className="dash-hero">
        <div>
          <h1>🛡 {t('adminPanel')}</h1>
          <p>{t('welcome')}, {user.name} · {t('adminWelcome')}</p>
        </div>
      </section>

      {overview && (
        <div className="grid stat-grid stat-grid-4">
          <div className="card stat"><strong>{overview.users.total}</strong><span>{t('usersWord')} ({overview.users.clients} {t('clientsWord')} · {overview.users.technicians} {t('techniciansWord')})</span></div>
          <div className="card stat"><strong>{overview.bookings.total}</strong><span>{t('bookingsWord')} ({overview.bookings.completed} {t('done')})</span></div>
          <div className="card stat"><strong>{overview.invoices.collected} EGP</strong><span>{t('revenue')} · {overview.invoices.paid} {t('paidLabel')}</span></div>
          <div className="card stat"><strong>{overview.invoices.outstanding} EGP</strong><span>{t('outstanding')} · {overview.invoices.unpaid} {t('unpaidLabel')}</span></div>
          {overview.commission && <div className="card stat"><strong>{overview.commission.earned} EGP</strong><span>{t('commEarned')} ({Math.round(overview.commission.rate * 100)}%)</span></div>}
          {overview.commission && <div className="card stat"><strong>{overview.commission.collected} EGP</strong><span>{t('commCollected')}</span></div>}
          {overview.commission && <div className="card stat"><strong>{overview.commission.outstanding} EGP</strong><span>{t('commOutstanding')}</span></div>}
          {overview.verifiedTechnicians !== undefined && <div className="card stat"><strong>{overview.verifiedTechnicians}</strong><span>{t('verifiedLabel')} · {t('techniciansWord')}</span></div>}
        </div>
      )}

      <div className="btn-row admin-tabs" role="tablist">
        {tabs.map(([k, label, n]) => (
          <button key={k} role="tab" className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab(k); setMsg(''); setErr(''); }}>{label} ({n})</button>
        ))}
      </div>
      {msg && <p className="admin-flash ok">{msg}</p>}
      {err && <p className="admin-flash bad">{err}</p>}

      {tab === 'technicians' && (
        <>
          <div className="admin-bar"><h2 className="section-title">{t('techniciansWord')} ({techs.length})</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'tech', mode: 'add', data: { ...emptyTech } })}>+ {t('addTechnician')}</button></div>
          <div className="card table-wrap"><table className="table">
            <thead><tr><th>{t('name')}</th><th>{t('profession')}</th><th>{t('city')}</th><th>{t('districtLabel')}</th><th>{t('ratingLabel').replace(' (0-5)', '')}</th><th>{t('phoneLabel')}</th><th /></tr></thead>
            <tbody>
              {techs.map((x) => (
                <tr key={x.id}>
                  <td>{x.photo ? '📷 ' : ''}{x.name} {x.verified && <VerifiedBadge small />}</td><td>{profName(x.profession)}</td><td>{x.city}</td><td>{x.district || '-'}</td><td>{x.rating}</td><td dir="ltr">{x.phone || '-'}</td>
                  <td className="row-actions">
                    <button className={`btn btn-sm ${x.verified ? 'btn-ghost' : 'btn-primary'}`} onClick={() => run(() => api.patch(`/admin/technicians/${x.id}`, { verified: !x.verified }))}>{x.verified ? t('unverifyAction') : `✔ ${t('verifyAction')}`}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'tech', mode: 'edit', data: { id: x.id, name: x.name, profession: x.profession, city: x.city, district: x.district || '', phone: x.phone || '', rating: x.rating, hourlyRate: x.hourlyRate } })}>{t('crudEdit')}</button>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => del(`/admin/technicians/${x.id}`)}>{t('crudDelete')}</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
        </>
      )}

      {tab === 'users' && (
        <>
          <h2 className="section-title">{t('usersWord')} ({users.length})</h2>
          <div className="card table-wrap"><table className="table">
            <thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('roleWord')}</th><th>{t('city')}</th><th>{t('statusWord')}</th><th>{t('joinedLabel')}</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}{u.technician ? ` · ${profName(u.technician.profession)}` : ''}</td>
                  <td dir="ltr">{u.email || u.phone || '-'}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-pending' : u.role === 'technician' ? 'badge-accepted' : ''}`}>{roleLabel(u.role)}</span></td>
                  <td>{u.technician ? `${u.technician.district ? `${u.technician.district}, ` : ''}${u.technician.city}` : u.city || '-'}</td>
                  <td><span className={`badge ${u.active === false ? 'badge-declined' : 'badge-paid'}`}>{u.active === false ? t('inactiveWord') : t('activeWord')}</span></td>
                  <td>{(u.createdAt || '').slice(0, 10)}</td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'user', mode: 'edit', data: { id: u.id, name: u.name, role: u.role, city: u.city || '' } })}>{t('crudEdit')}</button>
                    {u.id !== user.id && <button className="btn btn-ghost btn-sm" onClick={() => toggleUser(u)}>{u.active === false ? t('crudActivate') : t('crudDeactivate')}</button>}
                    {u.id !== user.id && <button className="btn btn-ghost btn-sm danger" onClick={() => del(`/admin/users/${u.id}`)}>{t('crudDelete')}</button>}
                  </td>
                </tr>
              ))}
            </tbody></table></div>
        </>
      )}

      {tab === 'bookings' && (
        <>
          <h2 className="section-title">{t('bookingsWord')} ({bookings.length})</h2>
          <div className="card table-wrap"><table className="table">
            <thead><tr><th>#</th><th>{t('clientsWord')}</th><th>{t('techniciansWord')}</th><th>{t('dateWord')}</th><th>{t('statusWord')}</th><th /></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td dir="ltr">{b.id}</td><td>{b.clientName}</td><td>{b.technicianName}</td><td>{(b.date || '').slice(0, 10)}</td>
                  <td><span className={`badge badge-${b.status}`}>{t(b.status)}</span></td>
                  <td className="row-actions">
                    <select className="status-select" value={b.status} onChange={(e) => run(() => api.patch(`/admin/bookings/${b.id}`, { status: e.target.value }))}>
                      {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => del(`/admin/bookings/${b.id}`)}>{t('crudDelete')}</button>
                  </td>
                </tr>
              ))}
              {!bookings.length && <tr><td colSpan="6">{t('noData')}</td></tr>}
            </tbody></table></div>
        </>
      )}

      {tab === 'invoices' && (
        <>
          <h2 className="section-title">{t('invoices')} ({invoices.length})</h2>
          <div className="card table-wrap"><table className="table">
            <thead><tr><th>{t('invoice')}</th><th>{t('clientsWord')}</th><th>{t('techniciansWord')}</th><th>{t('totalDue')}</th><th>{t('method')}</th><th>{t('statusWord')}</th><th>{t('confirmationCode')}</th><th /></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td dir="ltr">{i.number}</td><td>{i.clientName}</td><td>{i.technicianName}</td><td>{i.total} EGP</td><td>{methodLabel(i.method)}</td>
                  <td><span className={`badge badge-${i.status}`}>{t(payStatusKey[i.status])}</span></td>
                  <td dir="ltr">{i.confirmationCode || '-'}</td>
                  <td className="row-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => togglePaid(i)}>{i.status === 'paid' ? t('markUnpaid') : `✓ ${t('markPaid')}`}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openInvoice(i)}>{t('crudEdit')}</button>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => del(`/admin/invoices/${i.id}`)}>{t('crudDelete')}</button>
                  </td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan="8">{t('noData')}</td></tr>}
            </tbody></table></div>
        </>
      )}

      {tab === 'commission' && comm && (
        <>
          <h2 className="section-title">{t('commissionTitle')} ({Math.round(comm.rate * 100)}%)</h2>
          <p className="muted comm-note">{t('commNote')}</p>
          <div className="grid stat-grid">
            <div className="card stat"><strong>{comm.totals.earned} EGP</strong><span>{t('commEarned')} · {comm.totals.jobs} {t('commJobs')}</span></div>
            <div className="card stat"><strong>{comm.totals.collected} EGP</strong><span>{t('commCollected')}</span></div>
            <div className="card stat"><strong>{comm.totals.outstanding} EGP</strong><span>{t('commOutstanding')}</span></div>
          </div>
          <h3 className="section-title">{t('commByTech')}</h3>
          <div className="card table-wrap"><table className="table">
            <thead><tr><th>{t('techniciansWord')}</th><th>{t('commJobs')}</th><th>{t('commEarned')}</th><th>{t('commCollected')}</th><th>{t('commOutstanding')}</th></tr></thead>
            <tbody>
              {comm.byTechnician.map((g) => (
                <tr key={g.technicianId}><td>{g.technicianName}</td><td>{g.jobs}</td><td>{g.earned} EGP</td><td>{g.collected} EGP</td><td><strong>{g.outstanding} EGP</strong></td></tr>
              ))}
              {!comm.byTechnician.length && <tr><td colSpan="5">{t('noData')}</td></tr>}
            </tbody></table></div>
          <h3 className="section-title">{t('commRows')}</h3>
          <div className="card table-wrap"><table className="table">
            <thead><tr><th>{t('invoice')}</th><th>{t('techniciansWord')}</th><th>{t('jobAmount')}</th><th>{t('commissionWord')}</th><th>{t('statusWord')}</th><th /></tr></thead>
            <tbody>
              {comm.rows.map((r) => (
                <tr key={r.invoiceId}>
                  <td dir="ltr">{r.number}</td><td>{r.technicianName}</td><td>{r.base} EGP</td><td>{r.commission} EGP</td>
                  <td><span className={`badge ${r.collected ? 'badge-paid' : 'badge-unpaid'}`}>{r.collected ? t('commCollected') : t('commOutstanding')}</span></td>
                  <td className="row-actions">
                    {r.viaOnline ? <span className="muted">{t('viaOnline')}</span>
                      : <button className={`btn btn-sm ${r.collected ? 'btn-ghost' : 'btn-primary'}`} onClick={() => run(() => api.patch(`/admin/invoices/${r.invoiceId}`, { commissionPaid: !r.collected }))}>{r.collected ? t('markNotReceived') : `✓ ${t('markReceived')}`}</button>}
                  </td>
                </tr>
              ))}
              {!comm.rows.length && <tr><td colSpan="6">{t('noData')}</td></tr>}
            </tbody></table></div>
        </>
      )}

      {pendingDel && (
        <div className="modal-back" onClick={() => setPendingDel(null)}>
          <div className="card modal" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <h3>{t('crudDelete')}</h3>
            <p>{t('confirmDelete')}</p>
            <div className="btn-row">
              <button className="btn btn-primary danger-solid" onClick={confirmDel}>{t('crudDelete')}</button>
              <button className="btn btn-ghost" onClick={() => setPendingDel(null)}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <form className="card modal form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>{modal.kind === 'tech' ? (modal.mode === 'add' ? t('addTechnician') : t('editTechnician')) : modal.kind === 'user' ? t('editUser') : modal.kind === 'booking' ? t('editBooking') : `${t('editInvoice')} ${modal.data.number || ''}`}</h3>
            {modal.kind === 'tech' && (
              <>
                <label>{t('name')}<input required value={modal.data.name} onChange={setF('name')} /></label>
                {modal.mode === 'add' && <label>{t('emailOptional')}<input type="email" dir="ltr" value={modal.data.email} onChange={setF('email')} /></label>}
                {modal.mode === 'add' && <label>{t('password')}<PasswordInput  required minLength={8} dir="ltr" value={modal.data.password} onChange={setF('password')} /></label>}
                <label>{t('profession')}
                  <select required value={modal.data.profession} onChange={setF('profession')}>
                    <option value="" />
                    {professions.map((p) => <option key={p.id} value={p.id}>{p.icon} {lang === 'ar' ? p.nameAr : p.name}</option>)}
                  </select>
                </label>
                <label>{t('city')}<input required value={modal.data.city} onChange={setF('city')} /></label>
                <label>{t('districtLabel')}<input value={modal.data.district} onChange={setF('district')} /></label>
                <label>{t('phoneLabel')}<input dir="ltr" value={modal.data.phone} onChange={setF('phone')} /></label>
                <label>{t('ratingLabel')}<input type="number" min="0" max="5" step="0.1" value={modal.data.rating} onChange={setF('rating')} /></label>
                <label>{t('hourlyLabel')}<input type="number" min="0" value={modal.data.hourlyRate} onChange={setF('hourlyRate')} /></label>
              </>
            )}
            {modal.kind === 'user' && (
              <>
                <label>{t('name')}<input required value={modal.data.name} onChange={setF('name')} /></label>
                <label>{t('roleWord')}
                  <select value={modal.data.role} onChange={setF('role')} disabled={modal.data.id === user.id}>
                    {['client', 'technician', 'admin'].map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </label>
                <label>{t('city')}<input value={modal.data.city} onChange={setF('city')} /></label>
              </>
            )}
            {modal.kind === 'invoice' && (
              <>
                <label>{t('serviceAmount')}<input type="number" min="0" required value={modal.data.a} onChange={setF('a')} /></label>
                <label>{t('feeAmount')}<input type="number" min="0" required value={modal.data.b} onChange={setF('b')} /></label>
                <label>{t('statusWord')}
                  <select value={modal.data.status} onChange={setF('status')}>
                    <option value="paid">{t('paidLabel')}</option><option value="unpaid">{t('unpaidLabel')}</option>
                  </select>
                </label>
              </>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" type="submit">{t('save')}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setModal(null)}>{t('closeBtn')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
