import './bs.scss';
import './dental.css';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/axios';
import { resizeImage } from '../utils/image';

const SITE = 'https://fanni-marketplace.vercel.app';
const CITY_SLUG = { luxor: 'Luxor', armant: 'Armant', esna: 'Esna', qena: 'Qena', aswan: 'Aswan' };
const CITY_AR = { Luxor: 'الأقصر', Armant: 'أرمنت', Esna: 'إسنا', Qena: 'قنا', Aswan: 'أسوان' };
const DISCLAIMER = 'الأسعار دي متوسطات منشورة في السوق المصري لأغراض المقارنة فقط، مش عروض ولا تسعير رسمي. السعر الفعلي بيتحدد من الدكتور بعد الكشف. المعلومات هنا مش بديل للاستشارة الطبية.';
const fmt = (n) => Number(n).toLocaleString('ar-EG');

function setMeta(sel, attr, val) { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); }
const META_SEL = [['meta[name="description"]', 'content'], ['link[rel="canonical"]', 'href'], ['meta[property="og:title"]', 'content'], ['meta[property="og:description"]', 'content'], ['meta[property="og:url"]', 'content'], ['meta[name="twitter:title"]', 'content'], ['meta[name="twitter:description"]', 'content']];
function useSeo({ title, desc, path, ld }) {
  useEffect(() => {
    const prevTitle = document.title;
    const prev = META_SEL.map(([sel, attr]) => { const e = document.querySelector(sel); return [sel, attr, e ? e.getAttribute(attr) : null]; });
    document.title = title;
    const url = `${SITE}${path}`;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('link[rel="canonical"]', 'href', url);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    let el = null;
    if (ld) { el = document.createElement('script'); el.type = 'application/ld+json'; el.text = JSON.stringify(ld); document.head.appendChild(el); }
    return () => { if (el) el.remove(); document.title = prevTitle; prev.forEach(([sel, attr, v]) => { if (v !== null) setMeta(sel, attr, v); }); };
  }, [title, desc, path]); // eslint-disable-line
}

function useDentalData() {
  const [data, setData] = useState({ procedures: [], cities: [], clinics: null, error: '' });
  useEffect(() => {
    let live = true;
    Promise.all([api.get('/dental/procedures'), api.get('/dental/clinics')])
      .then(([p, c]) => live && setData({ procedures: p.data.procedures, cities: p.data.cities, clinics: c.data.clinics, error: '' }))
      .catch((e) => live && setData((d) => ({ ...d, clinics: [], error: errorMessage(e, 'تعذر تحميل البيانات') })));
    return () => { live = false; };
  }, []);
  return data;
}

function Carousel({ photos, id, alt }) {
  const [i, setI] = useState(0);
  if (!photos || !photos.length) return <div className="dental-ph" aria-hidden="true">🦷</div>;
  const n = photos.length;
  return (
    <div id={id} className="carousel slide">
      {n > 1 && (
        <div className="carousel-indicators">
          {photos.map((_, k) => <button type="button" key={k} className={k === i ? 'active' : ''} aria-label={`صورة ${k + 1}`} onClick={() => setI(k)} />)}
        </div>
      )}
      <div className="carousel-inner">
        {photos.map((p, k) => (
          <div key={k} className={`carousel-item${k === i ? ' active' : ''}`}><img className="dental-img d-block w-100" src={p} alt={`${alt} - ${k + 1}`} loading="lazy" /></div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button className="carousel-control-prev" type="button" aria-label="السابق" onClick={() => setI((i + 1) % n)}><span className="carousel-control-prev-icon" aria-hidden="true" /></button>
          <button className="carousel-control-next" type="button" aria-label="التالي" onClick={() => setI((i - 1 + n) % n)}><span className="carousel-control-next-icon" aria-hidden="true" /></button>
        </>
      )}
    </div>
  );
}

const waLink = (num, text) => `https://wa.me/20${String(num).replace(/^0/, '')}?text=${encodeURIComponent(text)}`;

const DAYS = [['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الاثنين'], ['tue', 'الثلاثاء'], ['wed', 'الأربعاء'], ['thu', 'الخميس'], ['fri', 'الجمعة']];
const YN = { yes: 'نعم', no: 'لا' };
const FAQ_Q = { emergency: 'بتستقبل حالات طوارئ؟', advanceBooking: 'لازم حجز مسبق؟', femaleDoctor: 'فيه طبيبة سيدات؟' };
const dayText = (v) => (v.mode === 'open' ? `${v.from} - ${v.to}` : v.mode === 'closed' ? 'مقفول' : 'بالحجز');

function ProfileFacts({ c }) {
  const sch = c.schedule || {}; const ins = c.insurance || {}; const faq = c.faq || {};
  const days = DAYS.filter(([k]) => sch[k]);
  return (
    <>
      {days.length > 0 && <table className="small mb-2"><tbody>{days.map(([k, ar]) => <tr key={k}><td className="pe-3">{ar}</td><td>{dayText(sch[k])}</td></tr>)}</tbody></table>}
      {ins.accepted && <p className="small mb-1">🏥 تأمين: {YN[ins.accepted]}{ins.accepted === 'yes' && ins.names ? ` (${ins.names})` : ''}</p>}
      {c.otherServices && <p className="small mb-1">خدمات أخرى: {c.otherServices}</p>}
      {Object.keys(faq).length > 0 && <ul className="list-unstyled small mb-2">{Object.entries(faq).map(([k, v]) => <li key={k}>{FAQ_Q[k]} <strong>{YN[v]}</strong></li>)}</ul>}
      {c.mapUrl && <p className="small mb-1"><a href={c.mapUrl} target="_blank" rel="noopener noreferrer nofollow">📍 الموقع على الخريطة</a></p>}
    </>
  );
}

function ClinicCard({ c, procedures }) {
  const names = Object.fromEntries(procedures.map((p) => [p.id, p.nameAr]));
  const prices = Object.entries(c.prices || {});
  return (
    <div className="col-md-6 col-lg-4">
      <div className="card h-100">
        <Carousel photos={c.photos} id={`car-${c.id}`} alt={c.name} />
        <div className="card-body">
          <h3 className="card-title h5">{c.name} {c.verified && <span className="badge text-bg-success" title="تم التحقق من العيادة تليفونيًا">✔ موثقة</span>}</h3>
          <p className="card-text text-muted small mb-2"><span className="badge text-bg-primary">{c.cityAr}</span> {c.address}</p>
          {c.hours && <p className="small mb-2">🕒 {c.hours}</p>}
          {c.mapUrl && <p className="small mb-2"><a href={c.mapUrl} target="_blank" rel="noopener noreferrer nofollow">📍 الموقع على الخريطة</a></p>}
          {prices.length > 0 && (
            <ul className="list-unstyled small mb-2">
              {prices.map(([k, v]) => <li key={k}>{names[k] || k}: <span className="dental-price">{fmt(v)} ج</span></li>)}
            </ul>
          )}
        </div>
        <div className="card-footer bg-transparent d-flex flex-wrap gap-2">
          {c.phone && <a className="btn btn-sm btn-outline-primary" href={`tel:${c.phone}`}>📞 اتصل</a>}
          {c.whatsapp && <a className="btn btn-sm btn-outline-success" href={waLink(c.whatsapp, `مرحبًا، عايز أحجز كشف أسنان. وصلت لحضرتك من FIX-IT`)} target="_blank" rel="noopener noreferrer">واتساب</a>}
          <Link className="btn btn-sm btn-primary" to={`/dental/clinic/${c.id}`}>اطلب موعد</Link>
        </div>
      </div>
    </div>
  );
}

function ClinicsGrid({ clinics, procedures, empty }) {
  if (clinics === null) return <p className="text-muted">جاري التحميل...</p>;
  if (!clinics.length) {
    return (
      <div className="alert alert-warning">
        {empty || 'لسه مفيش عيادات معتمدة هنا.'} لو أنت دكتور أسنان، <Link to="/dental/register">سجّل عيادتك مجانًا</Link> وهتظهر بعد مراجعتنا.
      </div>
    );
  }
  return <div className="row g-3">{clinics.map((c) => <ClinicCard key={c.id} c={c} procedures={procedures} />)}</div>;
}

function ProcedureCards({ procedures }) {
  return (
    <div className="row g-3">
      {procedures.map((p) => (
        <div className="col-6 col-lg-3" key={p.id}>
          <div className="card h-100">
            <div className="card-body">
              <div style={{ fontSize: '2rem' }}>{p.icon}</div>
              <h3 className="card-title h6">{p.nameAr}</h3>
              <p className="dental-price mb-1">{p.min == null ? 'لا يوجد سعر منشور موثق' : `${fmt(p.min)} - ${fmt(p.max)} ج`}</p>
              <p className="small text-muted mb-2">تحديث: {p.checkedAt}</p>
              <Link to={`/dental/${p.slug}`} className="stretched-link small">التفاصيل والمصادر ←</Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CityChips({ active }) {
  return (
    <div className="mb-3">
      <Link className={`btn btn-sm me-1 mb-1 ${!active ? 'btn-primary' : 'btn-outline-primary'}`} to="/dental">كل المدن</Link>
      {Object.entries(CITY_SLUG).map(([s, en]) => (
        <Link key={s} className={`btn btn-sm me-1 mb-1 ${active === en ? 'btn-primary' : 'btn-outline-primary'}`} to={`/dental/${s}`}>{CITY_AR[en]}</Link>
      ))}
    </div>
  );
}

function ComingSoon() {
  useEffect(() => {
    document.title = 'دليل الأسنان قريبًا | FIX-IT';
    let m = document.querySelector('meta[name="robots"]');
    const prev = m ? m.getAttribute('content') : null;
    if (m) m.setAttribute('content', 'noindex, follow');
    return () => { if (m && prev) m.setAttribute('content', prev); };
  }, []);
  return (
    <div className="bs py-4">
      <div className="card"><div className="card-body text-center py-5">
        <div style={{ fontSize: '3rem' }} aria-hidden="true">🦷</div>
        <span className="badge text-bg-warning mb-2">قريبًا · في الانتظار</span>
        <h1 className="h4">دليل أسعار وعيادات الأسنان</h1>
        <p className="text-muted mb-3">بنراجع الدليل مع عيادات حقيقية في الأقصر والجنوب، وهيفتح قريبًا.</p>
        <Link to="/dental/register" className="btn btn-primary">دكتور أسنان؟ سجّل عيادتك</Link>
      </div></div>
    </div>
  );
}

export function useDentalEnabled() {
  const [on, setOn] = useState(null);
  useEffect(() => { api.get('/dental/status').then((r) => setOn(!!r.data.enabled)).catch(() => setOn(false)); }, []);
  return on;
}

export function DentalHome() {
  const { slug } = useParams();
  const on = useDentalEnabled();
  const d = useDentalData();
  const cityEn = slug ? CITY_SLUG[slug] : null;
  const proc = slug && !cityEn ? d.procedures.find((p) => p.slug === slug) : null;
  const cityAr = cityEn ? CITY_AR[cityEn] : null;
  const procName = proc ? proc.nameAr : null;
  const title = proc ? `سعر ${procName} في مصر وفي الأقصر 2026 | FIX-IT`
    : cityAr ? `دكتور أسنان في ${cityAr} وأسعار الكشف والعلاج | FIX-IT` : 'أسعار علاج الأسنان في الأقصر وإسنا وقنا وأرمنت | دليل أسنان FIX-IT';
  const desc = proc ? (proc.min == null ? `${procName}: لا يوجد سعر منشور موثق حاليًا. اطلب موعد من عيادة معتمدة.` : `أسعار ${procName} المنشورة في مصر: من ${fmt(proc.min)} إلى ${fmt(proc.max)} جنيه، مع المصادر وتاريخ المراجعة.`)
    : cityAr ? `دليل عيادات الأسنان في ${cityAr}. اطلب موعد من عيادة معتمدة.` : 'دليل أسعار الأسنان: تنظيف جير، حشو، علاج عصب، خلع، تلبيس وتبييض، مع عيادات الأسنان في الأقصر وإسنا وقنا وأرمنت.';
  const path = proc ? `/dental/${slug}` : cityEn ? `/dental/${slug}` : '/dental';
  const faq = proc && proc.min != null ? [[`كم سعر ${procName} في مصر؟`, `أقل رقم منشور في المصادر ${fmt(proc.min)} جنيه وأعلى رقم ${fmt(proc.max)} جنيه (المصادر مذكورة في الصفحة).`]] : null;
  useSeo({ title, desc, path, ld: faq ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) } : null });
  if (on === false) return <ComingSoon />;
  if (slug && !cityEn && d.procedures.length && !proc) return <Navigate to="/dental" replace />;
  const clinics = d.clinics && (cityEn ? d.clinics.filter((c) => c.city === cityEn) : d.clinics);
  return (
    <div className="bs py-3">
      <h1>{proc ? `سعر ${procName} في مصر` : cityAr ? `دكتور أسنان في ${cityAr}` : 'دليل أسعار الأسنان وعيادات الأقصر والجنوب'}</h1>
      <div className="alert alert-warning small my-3">{DISCLAIMER}</div>
      {d.error && <div className="alert alert-danger">{d.error}</div>}
      {proc ? (
        <div className="card mb-3"><div className="card-body">
          <p className="dental-price fs-4 mb-1">{proc.min == null ? 'لا يوجد سعر منشور موثق لهذا الإجراء حاليًا' : `${fmt(proc.min)} - ${fmt(proc.max)} جنيه`}</p>
          {proc.descAr && <p>{proc.descAr}</p>}
          <h2 className="h6">المصادر (أسعار منشورة)</h2>
          <ul className="small">{proc.sources.map((s) => <li key={s.name}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.name}</a> : s.name}</li>)}</ul>
          <p className="small text-muted mb-0">آخر مراجعة: {proc.checkedAt}. النطاق = أقل وأعلى رقم لقيناه منشور.</p>
          {faq && <div className="mt-3">{faq.map(([q, a]) => <div key={q}><h3 className="h6">{q}</h3><p className="small">{a}</p></div>)}</div>}
        </div></div>
      ) : <><h2>أسعار الإجراءات الشائعة</h2><ProcedureCards procedures={d.procedures} /></>}
      <h2>{cityAr ? `عيادات الأسنان في ${cityAr}` : 'عيادات الأسنان'}</h2>
      <CityChips active={cityEn} />
      <ClinicsGrid clinics={clinics} procedures={d.procedures} empty={cityAr ? `لسه مفيش عيادات معتمدة في ${cityAr}.` : null} />
      <div className="card mt-4"><div className="card-body">
        <h3 className="h6">دكتور أسنان؟ ضيف عيادتك</h3>
        <p className="small mb-2">التسجيل مجانًا لمدة 3 شهور كميزة إطلاق، وبنراجع كل عيادة قبل ما تظهر. مفيش عمولة على الكشف أو العلاج.</p>
        <Link to="/dental/register" className="btn btn-primary btn-sm">سجّل عيادتك</Link>
      </div></div>
    </div>
  );
}

export function ClinicPage() {
  const { id } = useParams();
  const on = useDentalEnabled();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [procs, setProcs] = useState([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', phone: '', procedure: '', preferred: '', note: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/dental/clinics/${id}`).then((r) => setC(r.data.clinic)).catch(() => nav('/dental', { replace: true }));
    api.get('/dental/procedures').then((r) => setProcs(r.data.procedures));
  }, [id, nav]);
  useSeo({ title: c ? `${c.name} - دكتور أسنان في ${c.cityAr} | FIX-IT` : 'عيادة أسنان | FIX-IT', desc: c ? `${c.name} في ${c.cityAr}: ${c.address}. اطلب موعد أو اتصل بالعيادة.` : 'عيادة أسنان', path: `/dental/clinic/${id}` });
  if (on === false) return <ComingSoon />;
  if (!c) return <div className="bs py-3"><p>جاري التحميل...</p></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api.post('/dental/appointments', { ...f, clinicId: c.id }); setDone(true); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  const names = Object.fromEntries(procs.map((p) => [p.id, p.nameAr]));
  return (
    <div className="bs py-3">
      <p><Link to="/dental">← دليل الأسنان</Link></p>
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card"><Carousel photos={c.photos} id="car-main" alt={c.name} />
            <div className="card-body">
              <h1 className="h4">{c.name} {c.verified && <span className="badge text-bg-success">✔ موثقة</span>}</h1>
              <p className="mb-1"><span className="badge text-bg-primary">{c.cityAr}</span> {c.address}</p>
              {c.hours && <p className="small mb-1">🕒 {c.hours}</p>}
              <ProfileFacts c={c} />
              {c.about && <p className="small">{c.about}</p>}
              {(c.services || []).length > 0 && <p className="small mb-2">الخدمات: {c.services.map((k) => <span key={k} className="badge text-bg-light border me-1">{names[k] || k}</span>)}</p>}
              {Object.keys(c.prices || {}).length > 0 && <table><tbody>{Object.entries(c.prices).map(([k, v]) => <tr key={k}><td>{names[k] || k}</td><td className="dental-price">{fmt(v)} ج</td></tr>)}</tbody></table>}
              <div className="d-flex gap-2 mt-3">
                {c.phone && <a className="btn btn-outline-primary" href={`tel:${c.phone}`}>📞 اتصل</a>}
                {c.whatsapp && <a className="btn btn-outline-success" href={waLink(c.whatsapp, 'مرحبًا، عايز أحجز كشف أسنان. وصلت لحضرتك من FIX-IT')} target="_blank" rel="noopener noreferrer">واتساب</a>}
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-6" id="book">
          <div className="card"><div className="card-body">
            <h2 className="h5 mt-0">اطلب موعد</h2>
            {done ? (
              <div className="alert alert-success">وصلنا طلبك. هنبلغ العيادة. ولو مستعجل، كلمهم مباشرة {c.whatsapp && <a href={waLink(c.whatsapp, `مرحبًا، أنا ${f.name}، طلبت موعد من FIX-IT. رقمي ${f.phone}`)} target="_blank" rel="noopener noreferrer">ابعت واتساب دلوقتي</a>}.</div>
            ) : (
              <form onSubmit={submit}>
                <label className="form-label">الاسم<input className="form-control" required minLength={2} value={f.name} onChange={set('name')} /></label>
                <label className="form-label mt-2">موبايلك<input className="form-control" required dir="ltr" type="tel" placeholder="01012345678" pattern="^(\+?20|0)?1[0125][0-9]{8}$" value={f.phone} onChange={set('phone')} /></label>
                <label className="form-label mt-2">الخدمة المطلوبة
                  <select className="form-select" value={f.procedure} onChange={set('procedure')}><option value="">مش متأكد / كشف</option>{procs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}</select></label>
                <label className="form-label mt-2">الوقت المناسب<input className="form-control" maxLength={80} placeholder="مثال: بعد العصر الخميس" value={f.preferred} onChange={set('preferred')} /></label>
                <label className="form-label mt-2">ملاحظات (اختياري)<textarea className="form-control" maxLength={300} rows={2} value={f.note} onChange={set('note')} /></label>
                {err && <div className="alert alert-danger mt-2">{err}</div>}
                <button className="btn btn-primary mt-3" disabled={busy}>{busy ? '...' : 'ابعت الطلب'}</button>
                <p className="small text-muted mt-2 mb-0">مفيش دفع هنا. السعر والموعد بتتفق عليهم مع العيادة.</p>
              </form>
            )}
          </div></div>
        </div>
      </div>
    </div>
  );
}

export function ClinicRegister() {
  const [procs, setProcs] = useState([]);
  const [f, setF] = useState({ name: '', contactName: '', city: '', address: '', phone: '', whatsapp: '', email: '', registryId: '', about: '', schedule: {}, insAccepted: '', insNames: '', mapUrl: '', otherServices: '', faq: {}, services: [], prices: {}, photos: [], photoConsent: false, confirmOwner: false });
  const [err, setErr] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  useSeo({ title: 'سجّل عيادة أسنان | FIX-IT', desc: 'دكتور أسنان في الأقصر أو إسنا أو قنا أو أرمنت؟ سجّل عيادتك مجانًا لمدة 3 شهور كميزة إطلاق، وهتظهر للمرضى بعد المراجعة.', path: '/dental/register' });
  useEffect(() => { api.get('/dental/register-options').then((r) => setProcs(r.data.procedures)); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggle = (id) => setF({ ...f, services: f.services.includes(id) ? f.services.filter((s) => s !== id) : [...f.services, id] });
  const addPhotos = async (e) => {
    const files = [...e.target.files].slice(0, 5 - f.photos.length);
    const out = [];
    for (const file of files) { try { out.push(await resizeImage(file, 900, 0.72)); } catch { /* skip bad file */ } }
    setF((s) => ({ ...s, photos: [...s.photos, ...out].slice(0, 5) })); e.target.value = '';
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const { insAccepted, insNames, ...rest } = f; await api.post('/dental/clinics', { ...rest, insurance: { accepted: insAccepted, names: insNames } }); setDone(true); window.scrollTo(0, 0); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  if (done) return <div className="bs py-3"><div className="alert alert-success"><h1 className="h5">وصلنا طلب التسجيل ✅</h1><p className="mb-0">هنراجع بيانات العيادة ونتصل بيك للتأكيد، وبعدها بتظهر في الدليل. <Link to="/">الرئيسية</Link></p></div></div>;
  return (
    <div className="bs py-3">
      <h1>سجّل عيادة الأسنان</h1>
      <div className="alert alert-success mb-3"><strong>مجانًا لمدة 3 شهور كميزة إطلاق.</strong> بدون عمولة وبدون أي مدفوعات. كل عيادة بتتراجع قبل ما تظهر.</div>
      <form onSubmit={submit} className="card reg-form"><div className="card-body">
        <fieldset className="reg-section"><legend>بيانات العيادة</legend>
        <div className="row g-3">
          <div className="col-md-6"><label className="form-label">اسم العيادة<input className="form-control" required value={f.name} onChange={set('name')} /></label></div>
          <div className="col-md-6"><label className="form-label">اسم المسؤول<input className="form-control" required value={f.contactName} onChange={set('contactName')} /></label></div>
          <div className="col-md-6"><label className="form-label">المدينة<select className="form-select" required value={f.city} onChange={set('city')}><option value="">اختر</option>{Object.entries(CITY_AR).map(([en, ar]) => <option key={en} value={en}>{ar}</option>)}</select></label></div>
          <div className="col-md-6"><label className="form-label">العنوان<input className="form-control" required value={f.address} onChange={set('address')} /></label></div>
        </div></fieldset>
        <fieldset className="reg-section"><legend>التواصل</legend>
        <div className="row g-3">
          <div className="col-md-6"><label className="form-label">تليفون العيادة<input className="form-control" required dir="ltr" type="tel" value={f.phone} onChange={set('phone')} /></label></div>
          <div className="col-md-6"><label className="form-label">واتساب (اختياري)<input className="form-control" dir="ltr" type="tel" value={f.whatsapp} onChange={set('whatsapp')} /></label></div>
          <div className="col-md-6"><label className="form-label">إيميل (اختياري، مش بيظهر للعامة)<input className="form-control" dir="ltr" type="email" value={f.email} onChange={set('email')} /></label></div>
          <div className="col-md-6"><label className="form-label">رقم السجل التجاري أو البطاقة الضريبية (اختياري، مش بيظهر للعامة)<input className="form-control" dir="ltr" maxLength={40} value={f.registryId} onChange={set('registryId')} /></label><div className="form-text">بنستخدمه بس عشان نتأكد إن العيادة نشاط مسجل، وبيساعد في توثيقها.</div></div>
          <div className="col-12"><label className="form-label">رابط موقع العيادة على خرائط جوجل (اختياري)<input className="form-control" dir="ltr" type="url" placeholder="https://maps.app.goo.gl/..." value={f.mapUrl} onChange={set('mapUrl')} /></label><div className="form-text">افتح العيادة في Google Maps واضغط "مشاركة" وانسخ الرابط.</div></div>
          <div className="col-12"><label className="form-label">نبذة عن العيادة<textarea className="form-control" rows={2} maxLength={600} value={f.about} onChange={set('about')} /></label></div>
        </div></fieldset>
        <h2 className="reg-title">الخدمات وأسعارك (اختياري)</h2>
        <p className="small text-muted">اكتب سعرك الفعلي. لازم يكون قريب من نطاق السوق.</p>
        {procs.map((p) => (
          <div className="d-flex align-items-center gap-2 mb-2" key={p.id}>
            <input type="checkbox" className="form-check-input" checked={f.services.includes(p.id)} onChange={() => toggle(p.id)} id={`s-${p.id}`} />
            <label htmlFor={`s-${p.id}`} className="flex-grow-1 mb-0">{p.nameAr} {p.min != null && <span className="small text-muted">({fmt(p.min)}-{fmt(p.max)})</span>}</label>
            <input className="form-control" style={{ width: 120 }} inputMode="numeric" type="number" min="0" placeholder="سعرك" dir="ltr" value={f.prices[p.id] || ''} onChange={(e) => setF({ ...f, prices: { ...f.prices, [p.id]: e.target.value }, services: e.target.value && !f.services.includes(p.id) ? [...f.services, p.id] : f.services })} />
          </div>
        ))}
        <h2 className="reg-title">أيام وساعات العمل (اختياري، سيب اليوم فاضي لو مش عايز تكتبه)</h2>
        {DAYS.map(([k, ar]) => { const v = f.schedule[k] || {}; const upd = (x) => setF({ ...f, schedule: { ...f.schedule, [k]: x } });
          return (
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2" key={k}>
              <span style={{ width: 80 }}>{ar}</span>
              <select className="form-select" style={{ width: 130 }} value={v.mode || ''} onChange={(e) => upd(e.target.value ? { ...v, mode: e.target.value } : undefined)}><option value="">غير محدد</option><option value="open">مفتوح</option><option value="closed">مقفول</option><option value="appointment">بالحجز فقط</option></select>
              {v.mode === 'open' && <><input className="form-control" style={{ width: 120 }} type="time" required dir="ltr" value={v.from || ''} onChange={(e) => upd({ ...v, from: e.target.value })} aria-label={`${ar} من`} /><span>إلى</span><input className="form-control" style={{ width: 120 }} type="time" required dir="ltr" value={v.to || ''} onChange={(e) => upd({ ...v, to: e.target.value })} aria-label={`${ar} إلى`} /></>}
            </div>
          ); })}
        <h2 className="reg-title">التأمين (اختياري)</h2>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <select className="form-select" style={{ width: 160 }} value={f.insAccepted} onChange={set('insAccepted')}><option value="">غير محدد</option><option value="yes">بنقبل تأمين</option><option value="no">مفيش تأمين</option></select>
          {f.insAccepted === 'yes' && <input className="form-control" style={{ maxWidth: 360 }} maxLength={200} placeholder="أسماء شركات التأمين" value={f.insNames} onChange={set('insNames')} />}
        </div>
        <h2 className="reg-title">معلومات يسأل عنها المرضى (اختياري)</h2>
        {Object.entries(FAQ_Q).map(([k, q]) => <div className="d-flex align-items-center gap-2 mb-2" key={k}><span className="flex-grow-1">{q}</span><select className="form-select" style={{ width: 130 }} value={f.faq[k] || ''} onChange={(e) => setF({ ...f, faq: { ...f.faq, [k]: e.target.value } })}><option value="">غير محدد</option><option value="yes">نعم</option><option value="no">لا</option></select></div>)}
        <div className="mt-3"><label className="form-label">خدمات أخرى (اختياري)<input className="form-control" maxLength={200} value={f.otherServices} onChange={set('otherServices')} /></label></div>
        <h2 className="reg-title">صور العيادة (اختياري، حتى 5)</h2>
        <input type="file" accept="image/*" multiple className="form-control" onChange={addPhotos} disabled={f.photos.length >= 5} />
        {f.photos.length > 0 && <div className="d-flex gap-2 flex-wrap mt-2">{f.photos.map((p, k) => <div key={k}><img src={p} alt="" style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 8 }} /><br /><button type="button" className="btn btn-sm btn-outline-danger mt-1" onClick={() => setF({ ...f, photos: f.photos.filter((_, j) => j !== k) })}>حذف</button></div>)}</div>}
        {f.photos.length > 0 && <div className="form-check mt-2"><input id="pc" type="checkbox" className="form-check-input" checked={f.photoConsent} onChange={set('photoConsent')} /><label htmlFor="pc" className="form-check-label small">الصور دي بتاعتي وموافق إنها تتعرض على FIX-IT.</label></div>}
        <div className="form-check mt-3"><input id="co" type="checkbox" className="form-check-input" required checked={f.confirmOwner} onChange={set('confirmOwner')} /><label htmlFor="co" className="form-check-label">أنا صاحب العيادة أو مفوض بتسجيلها، والبيانات صحيحة.</label></div>
        {err && <div className="alert alert-danger mt-3">{err}</div>}
        <button className="btn btn-primary mt-3" disabled={busy}>{busy ? '...' : 'إرسال للمراجعة'}</button>
      </div></form>
    </div>
  );
}
