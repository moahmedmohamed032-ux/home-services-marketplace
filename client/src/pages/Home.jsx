import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProfessions, setFilters } from '../features/technicians/techniciansSlice';
import useGeolocation from '../components/useGeolocation';
import LocationError from '../components/LocationError';
import { useT } from '../i18n/useT';

export default function Home() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const professions = useSelector((s) => s.technicians.professions);
  const user = useSelector((s) => s.auth.user);
  const [locate, locating, geoError, retryLocate] = useGeolocation();

  useEffect(() => { dispatch(fetchProfessions()); }, [dispatch]);

  const findNearest = () => locate((pos) => {
    dispatch(setFilters({ ...pos, profession: '' }));
    navigate('/technicians');
  });

  return (
    <>
      <section className="hero">
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroSub')}</p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={findNearest} disabled={locating}>
            📍 {locating ? t('locating') : t('findNearest')}
          </button>
          {!user && <Link to="/register/client" className="btn btn-outline btn-lg">{t('joinClient')}</Link>}
        </div>
        {geoError && <LocationError retry={retryLocate} loading={locating} className="error" />}
      </section>

      <h2 className="section-title">{t('browseCategories')}</h2>
      <div className="grid cats">
        {professions.filter((p) => p.technicianCount > 0).map((p) => (
          <Link key={p.id} to={`/technicians?profession=${p.id}`} className="card cat">
            <span className="cat-icon">{p.icon}</span>
            <strong>{lang === 'ar' ? p.nameAr : p.name}</strong>
            <span className="muted">{p.technicianCount}</span>
          </Link>
        ))}
      </div>

      <h2 className="section-title">{t('howTitle')}</h2>
      <div className="grid steps">
        {['how1', 'how2', 'how3'].map((k, i) => (
          <div key={k} className="card step"><span className="step-n">{i + 1}</span><p>{t(k)}</p></div>
        ))}
      </div>

      <section className="card seo-luxor">
        <h2>{t('seoLuxorTitle')}</h2>
        <p>{t('seoLuxorText')}</p>
        <div className="chip-row">
          {professions.filter((p) => p.technicianCount > 0 && ['plumber', 'electrician', 'ac-technician', 'carpenter', 'painter'].includes(p.id)).map((p) => (
            <Link key={p.id} to={`/luxor/${p.id}`} className="chip">{lang === 'ar' ? `${p.nameAr} الأقصر` : `${p.name} in Luxor`}</Link>
          ))}
        </div>
      </section>

      <section className="card seo-luxor">
        <h2>{lang === 'ar' ? 'بنخدمك في أربع مدن' : 'We serve four cities'}</h2>
        <div className="chip-row">
          {[['Luxor', 'الأقصر'], ['Esna', 'إسنا'], ['Qena', 'قنا'], ['Aswan', 'أسوان']].map(([k, ar]) => (
            <Link key={k} to={`/technicians?city=${k}`} className="chip">{lang === 'ar' ? ar : k}</Link>
          ))}
        </div>
      </section>

      {!user && (
        <section className="cta card">
          <div><h2>{t('areTech')}</h2><p className="muted">{t('areTechSub')}</p></div>
          <Link to="/register/technician" className="btn btn-accent btn-lg">🔧 {t('joinTech')}</Link>
        </section>
      )}
    </>
  );
}
