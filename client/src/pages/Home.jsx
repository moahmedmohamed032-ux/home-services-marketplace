import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchProfessions, fetchTechnicians } from '../features/technicians/techniciansSlice';
import TechnicianCard from '../components/TechnicianCard';

export default function Home() {
  const dispatch = useDispatch();
  const { professions, list } = useSelector((s) => s.technicians);

  useEffect(() => {
    dispatch(fetchProfessions());
    dispatch(fetchTechnicians({}));
  }, [dispatch]);

  return (
    <>
      <section className="hero">
        <h1>Every home job, one trusted technician away</h1>
        <p>
          Fanni connects you with vetted professionals for any trade — plumbing,
          electrical, painting, carpentry, AC and more. Book in minutes, track
          the job, and review the work.
        </p>
        <div className="hero-actions">
          <Link to="/technicians" className="btn btn-primary btn-lg">Find a technician</Link>
          <Link to="/register?role=technician" className="btn btn-ghost btn-lg">Join as a pro</Link>
        </div>
      </section>

      <section>
        <h2 className="section-title">Browse by profession</h2>
        <div className="grid professions-grid">
          {professions.map((p) => (
            <Link key={p.id} to={`/technicians?profession=${p.id}`} className="card profession-card">
              <span className="profession-icon">{p.icon}</span>
              <h3>{p.name}</h3>
              <p className="muted">{p.nameAr}</p>
              <span className="badge">{p.technicianCount} pros</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Top rated near you</h2>
        <div className="grid tech-grid">
          {list.slice(0, 3).map((t) => (
            <TechnicianCard
              key={t.id}
              technician={t}
              professionIcon={professions.find((p) => p.id === t.profession)?.icon}
              professionName={professions.find((p) => p.id === t.profession)?.name}
            />
          ))}
        </div>
      </section>

      <section className="how-it-works">
        <h2 className="section-title">How it works</h2>
        <div className="grid three">
          <div className="card step"><span className="step-num">1</span><h3>Search</h3><p>Filter technicians by trade, city and rating.</p></div>
          <div className="card step"><span className="step-num">2</span><h3>Book</h3><p>Pick a pro, describe the job and choose a date.</p></div>
          <div className="card step"><span className="step-num">3</span><h3>Track &amp; review</h3><p>Follow the booking status and rate the finished work.</p></div>
        </div>
      </section>
    </>
  );
}
