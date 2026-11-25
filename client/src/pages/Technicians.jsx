import { useEffect } from 'react';
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
      </div>

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
