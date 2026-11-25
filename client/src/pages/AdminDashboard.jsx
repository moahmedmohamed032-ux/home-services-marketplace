import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../api/axios';
import { useT } from '../i18n/useT';

// Admin-only dashboard: site overview, registered users and invoices.
export default function AdminDashboard() {
  const { t, lang } = useT();
  const user = useSelector((s) => s.auth.user);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [professions, setProfessions] = useState([]);

  const load = () => {
    api.get('/admin/overview').then((r) => setOverview(r.data.overview)).catch(() => {});
    api.get('/admin/users').then((r) => setUsers(r.data.users)).catch(() => {});
    api.get('/admin/invoices').then((r) => setInvoices(r.data.invoices)).catch(() => {});
    api.get('/professions').then((r) => setProfessions(r.data.professions)).catch(() => {});
  };
  useEffect(load, []);

  const confirm = async (id) => { await api.post(`/invoices/${id}/confirm`); load(); };
  const payStatusKey = { paid: 'paidLabel', unpaid: 'unpaidLabel', pending_verification: 'pendingVerification', pending_cash: 'pendingCash', pending_online: 'pendingOnline' };
  const methodLabel = (m) => (m === 'visa' ? t('visa') : m === 'vodafone-cash' ? t('vodafoneCash') : m === 'cash' ? t('cash') : '-');
  const profName = (id) => { const p = professions.find((x) => x.id === id); return p ? (lang === 'ar' ? p.nameAr : p.name) : id; };
  const roleLabel = (r) => (r === 'client' ? t('clientsWord') : r === 'technician' ? t('techniciansWord') : t('admin'));

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
          <div className="card stat"><strong>{overview.bookings.total}</strong><span>{t('bookingsWord')} ({overview.bookings.completed} {t('done')}</span></div>
          <div className="card stat"><strong>{overview.invoices.collected} EGP</strong><span>{t('revenue')} · {overview.invoices.paid} {t('paidLabel')}</span></div>
          <div className="card stat"><strong>{overview.invoices.outstanding} EGP</strong><span>{t('outstanding')} · {overview.invoices.unpaid} {t('unpaidLabel')}</span></div>
        </div>
      )}

      <h2 className="section-title">{t('usersWord')} ({users.length})</h2>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('roleWord')}</th><th>{t('city')}</th><th>{t('joinedLabel')}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.technician ? ` · ${profName(u.technician.profession)}` : ''}</td>
                <td dir="ltr">{u.email}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'badge-pending' : u.role === 'technician' ? 'badge-accepted' : ''}`}>{roleLabel(u.role)}</span></td>
                <td>{u.technician ? `${u.technician.district ? `${u.technician.district}, ` : ''}${u.technician.city}` : u.city || '-'}</td>
                <td>{(u.createdAt || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">{t('invoices')} ({invoices.length})</h2>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('invoice')}</th><th>{t('clientsWord')}</th><th>{t('techniciansWord')}</th><th>{t('totalDue')}</th><th>{t('method')}</th><th>{t('statusWord')}</th><th>{t('confirmationCode')}</th><th /></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td dir="ltr">{i.number}</td>
                <td>{i.clientName}</td>
                <td>{i.technicianName}</td>
                <td>{i.total} EGP</td>
                <td>{methodLabel(i.method)}</td>
                <td><span className={`badge badge-${i.status}`}>{t(payStatusKey[i.status])}</span></td>
                <td dir="ltr">{i.confirmationCode || '-'}</td>
                <td>{i.status !== 'paid' && <button className="btn btn-primary btn-sm" onClick={() => confirm(i.id)}>✓ {t('markPaid')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
