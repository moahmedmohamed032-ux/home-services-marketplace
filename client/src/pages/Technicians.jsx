import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { fetchCities, fetchProfessions, fetchTechnicians, setFilters } from '../features/technicians/techniciansSlice';
import TechnicianCard from '../components/TechnicianCard';
import useGeolocation from '../components/useGeolocation';
import { useT } from '../i18n/useT';

export default function Technicians() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const { t, lang } = useT();
  const { professions, cities, list, filters, status } = useSelector((s) => s.technicians);
  const [locate, locating, geoError] = useGeolocation();
  const pName = (p) => (lang === 'ar' ? p.nameAr : p.name);

  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession !== null) dispatch(setFilters({ profession }));
    dispatch(fetchProfessions());
    dispatch(fetchCities());
  }, [dispatch, searchParams]);

  useEffect(() => { dispatch(fetchTechnicians(filters)); }, [dispatch, filters]);

  const update = (key) => (e) => dispatch(setFilters({ [key]: e.target.value }));
  const sorted = Boolean(filters.lat && filters.lng);
  const nearMe = () => (sorted ? dispatch(setFilters({ lat: '', lng: '' })) : locate((pos) => dispatch(setFilters(pos))));

  return (
    <>
      <h1 className="page-title">{t('find')}</h1>
      <div className="filters card">
        <input type="search" placeholder={t('search')} value={filters.search} onChange={update('search')} />
        <select value={filters.profession} onChange={update('profession')}>
          <option value="">{t('allProfessions')}</option>
          {professions.map((p) => <option key={p.id} value={p.id}>{p.icon} {pName(p)}</option>)}
        </select>
        <select value={filters.city} onChange={update('city')}>
          <option value="">{t('allCities')}</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" className={`btn ${sorted ? 'btn-primary' : 'btn-outline'}`} onClick={nearMe} disabled={locating}>
          📍 {locating ? t('locating') : sorted ? `${t('nearMe')} ✓` : t('nearMe')}
        </button>
      </div>
      {geoError && <p className="notice err">{t('locationDenied')}</p>}
      {status === 'loading' && <p className="muted">{t('loading')}</p>}
      {status !== 'loading' && list.length === 0 && <p className="muted">{t('noResults')}</p>}
      <div className="grid tech-grid">
        {list.map((x) => {
          const p = professions.find((q) => q.id === x.profession);
          return <TechnicianCard key={x.id} technician={x} professionIcon={p?.icon} professionName={p && pName(p)} />;
        })}
      </div>
    </>
  );
}
