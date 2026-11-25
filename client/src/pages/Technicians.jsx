import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  fetchCities, fetchProfessions, fetchTechnicians, setFilters,
} from '../features/technicians/techniciansSlice';
import TechnicianCard from '../components/TechnicianCard';

export default function Technicians() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const { professions, cities, list, filters, status } = useSelector((s) => s.technicians);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  // Seed the filter from the URL once (e.g. /technicians?profession=plumber).
  useEffect(() => {
    const profession = searchParams.get('profession') || '';
    dispatch(setFilters({ profession }));
    dispatch(fetchProfessions());
    dispatch(fetchCities());
  }, [dispatch, searchParams]);

  useEffect(() => {
    dispatch(fetchTechnicians(filters));
  }, [dispatch, filters]);

  const update = (key) => (e) => dispatch(setFilters({ [key]: e.target.value }));

  const nearMe = () => {
    if (filters.lat && filters.lng) {
      dispatch(setFilters({ lat: '', lng: '' }));
      return;
    }
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        dispatch(setFilters({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
      },
      () => {
        setLocating(false);
        setGeoError('Could not get your location — check browser permission');
      },
      { timeout: 10000 }
    );
  };

  const sortedByDistance = Boolean(filters.lat && filters.lng);

  return (
    <>
      <h1 className="page-title">Find a technician</h1>
      <div className="filters card">
        <input
          type="search"
          placeholder="Search by name or keyword…"
          value={filters.search}
          onChange={update('search')}
        />
        <select value={filters.profession} onChange={update('profession')}>
          <option value="">All professions</option>
          {professions.map((p) => (
            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
          ))}
        </select>
        <select value={filters.city} onChange={update('city')}>
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="button"
          className={`btn ${sortedByDistance ? 'btn-primary' : 'btn-ghost'}`}
          onClick={nearMe}
          disabled={locating}
        >
          {locating ? 'Locating…' : sortedByDistance ? '📍 Sorted by nearest (tap to clear)' : '📍 Near me'}
        </button>
      </div>
      {geoError && <p className="notice err">{geoError}</p>}
      {sortedByDistance && (
        <p className="muted">Showing the nearest suitable technicians first, best-rated on ties.</p>
      )}

      {status === 'loading' && <p className="muted">Loading…</p>}
      {status !== 'loading' && list.length === 0 && (
        <p className="muted">No technicians match these filters yet.</p>
      )}
      <div className="grid tech-grid">
        {list.map((t) => (
          <TechnicianCard
            key={t.id}
            technician={t}
            professionIcon={professions.find((p) => p.id === t.profession)?.icon}
            professionName={professions.find((p) => p.id === t.profession)?.name}
          />
        ))}
      </div>
    </>
  );
}
