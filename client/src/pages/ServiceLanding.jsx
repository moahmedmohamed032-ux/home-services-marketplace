import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CITY_PAGES, SITE, landingsFor } from './serviceLanding.data';

function setMeta(sel, attr, val) { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); }

export default function ServiceLanding({ city = 'luxor' }) {
  const { slug } = useParams();
  const LANDINGS = landingsFor(city);
  const cityAr = CITY_PAGES[city].ar;
  const d = LANDINGS[slug];
  useEffect(() => {
    if (!d) return undefined;
    document.title = d.title;
    setMeta('meta[name="description"]', 'content', d.desc);
    setMeta('link[rel="canonical"]', 'href', `${SITE}/${city}/${slug}`);
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'landing-ld';
    ld.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Service', name: d.h1, serviceType: d.h1, areaServed: { '@type': 'City', name: cityAr }, provider: { '@type': 'Organization', name: 'FIX-IT', url: SITE }, description: d.desc },
        { '@type': 'FAQPage', mainEntity: d.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      ],
    });
    document.head.appendChild(ld);
    return () => { ld.remove(); setMeta('link[rel="canonical"]', 'href', `${SITE}/`); };
  }, [d, slug, city, cityAr]);
  if (!d) return <Navigate to="/" replace />;
  return (
    <article className="card seo-luxor" style={{ marginTop: 16 }}>
      <h1>{d.h1}</h1>
      <p>{d.intro}</p>
      <p><Link to={`/technicians?profession=${slug}&city=${CITY_PAGES[city].en}`} className="btn btn-primary btn-lg">شوف {d.h1.replace(` في ${cityAr}`, '')} {cityAr} ←</Link></p>
      <h2>إيه اللي تقدر تطلبه؟</h2>
      <ul>{d.services.map((s) => <li key={s}>{s}</li>)}</ul>
      <h2>أسئلة شائعة</h2>
      {d.faq.map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}
      <div className="chip-row">
        {Object.entries(LANDINGS).filter(([k]) => k !== slug).map(([k, v]) => <Link key={k} to={`/${city}/${k}`} className="chip">{v.h1}</Link>)}
      </div>
      <div className="chip-row">
        {Object.entries(CITY_PAGES).filter(([k]) => k !== city).map(([k, v]) => <Link key={k} to={`/${k}/${slug}`} className="chip">{d.h1.replace(` في ${cityAr}`, '')} {v.ar}</Link>)}
      </div>
    </article>
  );
}
