import '../dental/bs.scss';
import '../dental/dental.css';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/axios';

const SITE = 'https://fanni-marketplace.vercel.app';
export const SPEC_AR = { dental: 'أسنان', 'ob-gyn': 'نساء وتوليد', pediatrics: 'أطفال', 'general-surgery': 'جراحة عامة', 'general-practice': 'ممارس عام', 'internal-medicine': 'باطنة', orthopedics: 'عظام', ophthalmology: 'عيون', cardiology: 'قلب وأوعية دموية', urology: 'مسالك بولية', dermatology: 'جلدية وتناسلية', 'neuro-psych': 'مخ وأعصاب ونفسية', hospital: 'مستشفيات', ent: 'أنف وأذن وحنجرة', chest: 'صدر', other: 'تخصصات أخرى', gastro: 'جهاز هضمي وكبد', 'plastic-surgery': 'جراحة تجميل', radiology: 'أشعة' };
const CITY_AR = { Luxor: 'الأقصر', Armant: 'أرمنت', Esna: 'إسنا', Qena: 'قنا', Aswan: 'أسوان' };
const KIND_AR = { clinic: 'عيادة', hospital: 'مستشفى' };
const n = (v) => Number(v).toLocaleString('ar-EG');

function useMeta({ title, desc, path, index }) {
  useEffect(() => {
    const sel = [['meta[name="description"]', 'content'], ['link[rel="canonical"]', 'href'], ['meta[property="og:title"]', 'content'], ['meta[property="og:description"]', 'content'], ['meta[property="og:url"]', 'content'], ['meta[name="twitter:title"]', 'content'], ['meta[name="twitter:description"]', 'content'], ['meta[name="robots"]', 'content']];
    const prevTitle = document.title;
    const prev = sel.map(([s, a]) => { const e = document.querySelector(s); return [s, a, e ? e.getAttribute(a) : null]; });
    const set = (s, a, v) => { const e = document.querySelector(s); if (e) e.setAttribute(a, v); };
    const url = `${SITE}${path}`;
    document.title = title;
    set('meta[name="description"]', 'content', desc); set('link[rel="canonical"]', 'href', url);
    set('meta[property="og:title"]', 'content', title); set('meta[property="og:description"]', 'content', desc); set('meta[property="og:url"]', 'content', url);
    set('meta[name="twitter:title"]', 'content', title); set('meta[name="twitter:description"]', 'content', desc);
    set('meta[name="robots"]', 'content', index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
    return () => { document.title = prevTitle; prev.forEach(([s, a, v]) => { if (v !== null) set(s, a, v); }); };
  }, [title, desc, path, index]);
}

function DirCard({ c }) {
  return (
    <div className="col-md-6 col-lg-4">
      <article className="card h-100">
        <div className="card-body">
          <h2 className="card-title h5">{c.name}</h2>
          <p className="mb-2">
            <span className="badge text-bg-primary me-1">{c.cityAr}</span>
            <span className="badge text-bg-secondary me-1">{KIND_AR[c.kind] || c.kind}</span>
            {c.specialty && <span className="badge text-bg-light border">{c.specialty}</span>}
          </p>
          {c.address && <p className="card-text small mb-2">📍 {c.address}</p>}
          {c.phone && <p className="small mb-2" dir="ltr">📞 {c.phone.split('/').map((x) => x.trim()).filter(Boolean).map((x, i) => <span key={x}>{i > 0 && ' / '}<a href={`tel:${x.replace(/[^\d+]/g, '')}`}>{x}</a></span>)}</p>}
        </div>
        <div className="card-footer bg-transparent small text-muted">المصدر: {c.sources.join(' + ')}</div>
      </article>
    </div>
  );
}

export default function Directory() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(parseInt(sp.get('page'), 10) || 1, 1);
  const city = sp.get('city') || ''; const q = sp.get('q') || '';
  const [qi, setQi] = useState(q);
  const [data, setData] = useState(null); const [err, setErr] = useState(false);
  const [sugg, setSugg] = useState([]); const [places, setPlaces] = useState([]);
  useEffect(() => { if (data && data.facets.places && !places.length) setPlaces(data.facets.places); }, [data]); // eslint-disable-line
  useEffect(() => {
    const t = qi.trim();
    if (t.length < 2) { setSugg([]); return undefined; }
    let live = true;
    const id = setTimeout(() => api.get('/directory/suggest', { params: { q: t } }).then((r) => live && setSugg(r.data.suggestions)).catch(() => {}), 200);
    return () => { live = false; clearTimeout(id); };
  }, [qi]);
  const known = !slug || !!SPEC_AR[slug];
  useEffect(() => {
    if (!known) return undefined;
    let live = true; setData(null); setErr(false);
    api.get('/directory', { params: { specialty: slug || undefined, city: city || undefined, q: q || undefined, page } }).then((r) => live && setData(r.data)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [slug, city, q, page, known]);
  const specAr = slug ? SPEC_AR[slug] : '';
  const base = slug ? `/directory/${slug}` : '/directory';
  const filtered = !!(city || q);
  const suffix = page > 1 ? ` - صفحة ${n(page)}` : '';
  const title = !known ? 'صفحة غير موجودة | FIX-IT' : slug ? `${slug === 'hospital' ? 'المستشفيات' : `عيادات ${specAr}`} في الأقصر وقنا${suffix} | FIX-IT` : `دليل العيادات والمستشفيات في الأقصر وقنا${suffix} | FIX-IT`;
  const desc = slug ? `دليل ${slug === 'hospital' ? 'المستشفيات' : `عيادات ${specAr}`} في الأقصر وقنا وإسنا وأرمنت: الاسم والتخصص والعنوان ومصدر كل بيان.` : 'دليل عيادات ومستشفيات الأقصر وقنا وإسنا وأرمنت: الاسم والتخصص والعنوان ومصدر كل بيان، من سجل مديرية الصحة الرسمي وقوائم منشورة.';
  useMeta({ title, desc, path: page > 1 ? `${base}?page=${page}` : base, index: known && !filtered });
  const go = (p) => { const next = new URLSearchParams(sp); if (p > 1) next.set('page', p); else next.delete('page'); setSp(next); window.scrollTo(0, 0); };
  const setFilter = (k, v) => { const next = new URLSearchParams(sp); if (v) next.set(k, v); else next.delete(k); next.delete('page'); setSp(next); };
  if (!known) return <div className="bs py-3"><h1>الصفحة غير موجودة</h1><Link to="/directory">كل العيادات والمستشفيات</Link></div>;
  const h1 = slug ? (slug === 'hospital' ? 'المستشفيات في الأقصر وقنا' : `عيادات ${specAr} في الأقصر وقنا`) : 'دليل العيادات والمستشفيات في الأقصر وقنا';
  return (
    <div className="bs py-3">
      <h1>{h1}</h1>
      <p className="text-muted">{data ? `${n(data.total)} نتيجة. ` : ''}بيانات من سجل مديرية الشئون الصحية بالأقصر وقوائم منشورة، والمصدر مكتوب على كل بطاقة. ممكن تكون ناقصة أو قديمة، والخانة الفاضية معناها إننا لسه معندناش البيان.</p>
      <div className="alert alert-success small">أنت صاحب عيادة؟ <Link to="/dental/register">سجّل عيادتك</Link>. مجانًا لمدة 3 شهور كميزة إطلاق، بدون عمولة وبدون مدفوعات.</div>
      <nav aria-label="التخصصات" className="mb-3">
        <Link className={`btn btn-sm me-1 mb-1 ${!slug ? 'btn-primary' : 'btn-outline-primary'}`} to="/directory">الكل</Link>
        {(data?.facets.specialties || []).filter(([k]) => SPEC_AR[k]).map(([k, c]) => (
          <Link key={k} className={`btn btn-sm me-1 mb-1 ${slug === k ? 'btn-primary' : 'btn-outline-primary'}`} to={`/directory/${k}`}>{SPEC_AR[k]} ({n(c)})</Link>
        ))}
      </nav>
      <form className="row g-2 mb-3" onSubmit={(e) => { e.preventDefault(); setFilter('q', qi.trim()); }}>
        <div className="col-md-3"><select className="form-select" aria-label="المدينة" value={city} onChange={(e) => setFilter('city', e.target.value)}><option value="">كل المدن</option>{(data?.facets.cities || []).map(([k]) => <option key={k} value={k}>{CITY_AR[k] || k}</option>)}</select></div>
        <div className="col-md-7"><input className="form-control" aria-label="بحث بالاسم أو المكان" list="dir-suggest" autoComplete="off" placeholder="ابحث باسم العيادة أو المكان (مثال: شارع التليفزيون)" value={qi} onChange={(e) => setQi(e.target.value)} /><datalist id="dir-suggest">{(qi.trim().length >= 2 ? sugg : places).map((v) => <option key={v} value={v} />)}</datalist></div>
        <div className="col-md-2"><button className="btn btn-primary w-100">بحث</button></div>
      </form>
      {err && <div className="alert alert-danger">حصلت مشكلة في التحميل، جرّب تاني.</div>}
      {!data && !err && <p className="text-muted">جاري التحميل...</p>}
      {data && !data.items.length && <div className="alert alert-warning">مفيش نتائج مطابقة.</div>}
      {data && <div className="row g-3">{data.items.map((c) => <DirCard key={c.id} c={c} />)}</div>}
      {data && data.pages > 1 && (
        <nav className="d-flex gap-2 align-items-center mt-4" aria-label="الصفحات">
          <button className="btn btn-outline-primary btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>السابق</button>
          <span className="small">صفحة {n(data.page)} من {n(data.pages)}</span>
          <button className="btn btn-outline-primary btn-sm" disabled={page >= data.pages} onClick={() => go(page + 1)}>التالي</button>
        </nav>
      )}
    </div>
  );
}
