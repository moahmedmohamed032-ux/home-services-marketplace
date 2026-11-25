import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LANDINGS, SITE } from './serviceLanding.data';

function setMeta(sel, attr, val) { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); }

export default function ServiceLanding() {
  const { slug } = useParams();
  const d = LANDINGS[slug];
  useEffect(() => {
    if (!d) return undefined;
    document.title = d.title;
    setMeta('meta[name="description"]', 'content', d.desc);
    setMeta('link[rel="canonical"]', 'href', `${SITE}/luxor/${slug}`);
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'landing-ld';
    ld.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Service', name: d.h1, serviceType: d.h1, areaServed: { '@type': 'City', name: 'الأقصر' }, provider: { '@type': 'Organization', name: 'FIX-IT', url: SITE }, description: d.desc },
        { '@type': 'FAQPage', mainEntity: d.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      ],
    });
    document.head.appendChild(ld);
    return () => { ld.remove(); setMeta('link[rel="canonical"]', 'href', `${SITE}/`); };
  }, [d, slug]);
  if (!d) return <Navigate to="/" replace />;
  return (
    <article className="card seo-luxor" style={{ marginTop: 16 }}>
      <h1>{d.h1}</h1>
      <p>{d.intro}</p>
      <p><Link to={`/technicians?profession=${slug}`} className="btn btn-primary btn-lg">شوف {d.h1.replace(' في الأقصر', '')} الأقصر ←</Link></p>
      <h2>إيه اللي تقدر تطلبه؟</h2>
      <ul>{d.services.map((s) => <li key={s}>{s}</li>)}</ul>
      <h2>أسئلة شائعة</h2>
      {d.faq.map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}
      <div className="chip-row">
        {Object.entries(LANDINGS).filter(([k]) => k !== slug).map(([k, v]) => <Link key={k} to={`/luxor/${k}`} className="chip">{v.h1}</Link>)}
      </div>
    </article>
  );
}
