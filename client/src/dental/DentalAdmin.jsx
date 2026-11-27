import './bs.scss';
import './dental.css';
import { useEffect, useState, useCallback } from 'react';
import { api, errorMessage } from '../api/axios';

const CITY_AR = { Luxor: 'الأقصر', Armant: 'أرمنت', Esna: 'إسنا', Qena: 'قنا', Aswan: 'أسوان' };
const STATUS = { new: 'جديد', contacted: 'تم التواصل', done: 'تم', cancelled: 'ملغي' };

export default function DentalAdmin() {
  const [tab, setTab] = useState('pending');
  const [clinics, setClinics] = useState([]); const [apts, setApts] = useState([]); const [procs, setProcs] = useState([]);
  const [err, setErr] = useState(''); const [q, setQ] = useState('');
  const load = useCallback(async () => {
    try {
      const [c, a, p] = await Promise.all([api.get('/admin/dental/clinics'), api.get('/admin/dental/appointments'), api.get('/admin/dental/procedures')]);
      setClinics(c.data.clinics); setApts(a.data.appointments); setProcs(p.data.procedures);
    } catch (e) { setErr(errorMessage(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const patch = async (url, body) => { setErr(''); try { await api.patch(url, body); await load(); } catch (e) { setErr(errorMessage(e)); } };
  const list = clinics.filter((c) => (tab === 'pending' ? !c.approved : tab === 'live' ? c.approved : true) && (!q || c.name.includes(q) || c.city.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="bs py-3">
      <h1>إدارة دليل الأسنان</h1>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="mb-3">
        {[['pending', `في الانتظار (${clinics.filter((c) => !c.approved).length})`], ['live', `ظاهرة (${clinics.filter((c) => c.approved).length})`], ['apts', `طلبات المواعيد (${apts.filter((a) => a.status === 'new').length})`], ['prices', 'نطاقات الأسعار']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm me-1 ${tab === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {(tab === 'pending' || tab === 'live') && (
        <>
          <input className="form-control mb-3" placeholder="بحث بالاسم أو المدينة" value={q} onChange={(e) => setQ(e.target.value)} />
          {tab === 'pending' && <div className="alert alert-warning small">عيادات "دليل عام" جاية من قوائم منشورة: اتصل بالعيادة وتأكد من الرقم والعنوان قبل الاعتماد. الاعتماد بينشر الاسم والتليفون والعنوان للعامة.</div>}
          <div className="row g-3">
            {list.map((c) => (
              <div className="col-md-6" key={c.id}><div className="card h-100"><div className="card-body">
                <h3 className="h6">{c.name} <span className="badge text-bg-secondary">{CITY_AR[c.city] || c.city}</span> <span className={`badge ${c.origin === 'registered' ? 'text-bg-success' : 'text-bg-warning'}`}>{c.origin === 'registered' ? 'سجّلت بنفسها' : 'دليل عام'}</span></h3>
                <p className="small mb-1">{c.address}</p>
                <p className="small mb-1" dir="ltr">📞 {c.phone || '—'}{c.phoneRaw && c.phoneRaw !== c.phone ? ` (أصل: ${c.phoneRaw.slice(0, 30)})` : ''} {c.whatsapp && ` | WA ${c.whatsapp}`}</p>
                {c.email && <p className="small mb-1" dir="ltr">✉ {c.email} {c.invited && '(اتبعتلها دعوة)'}</p>}
                {c.notes && <p className="small text-muted mb-1">{c.notes}</p>}
                {(c.sources || []).map((s) => <div key={s} className="small"><a href={s} target="_blank" rel="noopener noreferrer nofollow">مصدر</a></div>)}
                {(c.photos || []).length > 0 && <div className="d-flex gap-1 flex-wrap my-2">{c.photos.map((p, k) => <div key={k}><img src={p} alt={`${c.name} ${k + 1}`} style={{ width: 70, height: 55, objectFit: 'cover', borderRadius: 6 }} /><br /><button className="btn btn-sm btn-outline-danger py-0" onClick={() => patch(`/admin/dental/clinics/${c.id}`, { photos: c.photos.filter((_, j) => j !== k) })}>×</button></div>)}</div>}
                <div className="d-flex flex-wrap gap-1 mt-2">
                  {!c.approved ? <button className="btn btn-sm btn-success" onClick={() => patch(`/admin/dental/clinics/${c.id}`, { approved: true, verified: c.origin === 'registered' ? c.verified : false })}>✅ اعتماد</button>
                    : <button className="btn btn-sm btn-outline-secondary" onClick={() => patch(`/admin/dental/clinics/${c.id}`, { approved: false })}>إخفاء</button>}
                  <button className={`btn btn-sm ${c.verified ? 'btn-info' : 'btn-outline-info'}`} onClick={() => patch(`/admin/dental/clinics/${c.id}`, { verified: !c.verified })}>{c.verified ? '✔ موثقة' : 'توثيق (بعد مكالمة)'}</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => { const v = window.prompt('تليفون العيادة', c.phone); if (v !== null) patch(`/admin/dental/clinics/${c.id}`, { phone: v }); }}>تعديل التليفون</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => window.confirm('إزالة العيادة من القائمة؟') && patch(`/admin/dental/clinics/${c.id}`, { removed: true })}>إزالة</button>
                </div>
              </div></div></div>
            ))}
            {!list.length && <p className="text-muted">لا يوجد.</p>}
          </div>
        </>
      )}
      {tab === 'apts' && (
        <table><thead><tr><th>العيادة</th><th>الاسم</th><th>الموبايل</th><th>الخدمة</th><th>الوقت</th><th>الحالة</th></tr></thead><tbody>
          {apts.map((a) => <tr key={a.id}><td>{a.clinicName}</td><td>{a.name}</td><td dir="ltr"><a href={`tel:${a.phone}`}>{a.phone}</a></td><td>{a.procedure}</td><td>{a.preferred} {a.note}</td>
            <td><select className="form-select form-select-sm" value={a.status} onChange={(e) => patch(`/admin/dental/appointments/${a.id}`, { status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td></tr>)}
          {!apts.length && <tr><td colSpan={6} className="text-muted">لا توجد طلبات.</td></tr>}
        </tbody></table>
      )}
      {tab === 'prices' && (
        <table><thead><tr><th>الخدمة</th><th>من</th><th>إلى</th><th>آخر مراجعة</th></tr></thead><tbody>
          {procs.map((p) => <tr key={p.id}><td>{p.nameAr}</td>
            {['min', 'max'].map((k) => <td key={k}><input className="form-control form-control-sm" style={{ width: 90 }} type="number" defaultValue={p[k]} onBlur={(e) => Number(e.target.value) !== p[k] && patch(`/admin/dental/procedures/${p.id}`, { [k]: Number(e.target.value) })} /></td>)}
            <td>{p.checkedAt}</td></tr>)}
        </tbody></table>
      )}
    </div>
  );
}
