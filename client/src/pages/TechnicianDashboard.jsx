import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchIncomingBookings, updateBookingStatus } from '../features/bookings/bookingsSlice';
import { updateMyProfile } from '../features/technicians/techniciansSlice';
import { api } from '../api/axios';

export default function TechnicianDashboard() {
  const dispatch = useDispatch();
  const { incoming } = useSelector((s) => s.bookings);
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dispatch(fetchIncomingBookings());
    api.get('/technicians/me').then(({ data }) => setProfile(data.technician)).catch(() => {});
  }, [dispatch]);

  const setStatus = (id, status) => dispatch(updateBookingStatus({ id, status }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaved(false);
    const result = await dispatch(updateMyProfile({
      city: profile.city,
      hourlyRate: Number(profile.hourlyRate),
      yearsExperience: Number(profile.yearsExperience),
      bio: profile.bio,
    }));
    if (result.meta.requestStatus === 'fulfilled') setSaved(true);
  };

  const pending = incoming.filter((b) => b.status === 'pending');
  const active = incoming.filter((b) => b.status === 'accepted');
  const history = incoming.filter((b) => ['completed', 'declined', 'cancelled'].includes(b.status));

  return (
    <>
      <h1 className="page-title">Technician dashboard</h1>

      <section>
        <h2 className="section-title">New requests ({pending.length})</h2>
        {pending.length === 0 && <p className="muted">No new requests right now.</p>}
        <div className="booking-list">
          {pending.map((b) => (
            <div key={b.id} className="card booking-card">
              <div className="booking-head">
                <div>
                  <h3>{b.clientName}</h3>
                  <p className="muted">{new Date(b.date).toLocaleDateString()}</p>
                </div>
                <span className="badge status-pending">pending</span>
              </div>
              <p>{b.description}</p>
              <p className="muted">{b.address}</p>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={() => setStatus(b.id, 'accepted')}>Accept</button>
                <button className="btn btn-ghost" onClick={() => setStatus(b.id, 'declined')}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Scheduled jobs ({active.length})</h2>
        <div className="booking-list">
          {active.map((b) => (
            <div key={b.id} className="card booking-card">
              <div className="booking-head">
                <div>
                  <h3>{b.clientName}</h3>
                  <p className="muted">{new Date(b.date).toLocaleDateString()}</p>
                </div>
                <span className="badge status-accepted">accepted</span>
              </div>
              <p>{b.description}</p>
              <button className="btn btn-primary" onClick={() => setStatus(b.id, 'completed')}>Mark as completed</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">History ({history.length})</h2>
        <div className="booking-list">
          {history.map((b) => (
            <div key={b.id} className="card booking-card">
              <div className="booking-head">
                <div>
                  <h3>{b.clientName}</h3>
                  <p className="muted">{new Date(b.date).toLocaleDateString()}</p>
                </div>
                <span className={`badge status-${b.status}`}>{b.status}</span>
              </div>
              {b.review && <p className="notice ok">{'★'.repeat(b.review.rating)}{b.review.comment ? ` — “${b.review.comment}”` : ''}</p>}
            </div>
          ))}
        </div>
      </section>

      {profile && (
        <section>
          <h2 className="section-title">My profile</h2>
          <form className="card profile-form" onSubmit={saveProfile}>
            <div className="field-row">
              <label>
                City
                <input value={profile.city || ''} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
              </label>
              <label>
                Hourly rate (EGP)
                <input type="number" min="0" value={profile.hourlyRate || 0} onChange={(e) => setProfile({ ...profile, hourlyRate: e.target.value })} />
              </label>
              <label>
                Years of experience
                <input type="number" min="0" value={profile.yearsExperience || 0} onChange={(e) => setProfile({ ...profile, yearsExperience: e.target.value })} />
              </label>
            </div>
            <label>
              Bio
              <textarea rows="3" value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            </label>
            <button className="btn btn-primary" type="submit">Save profile</button>
            {saved && <p className="notice ok">Profile saved.</p>}
          </form>
        </section>
      )}
    </>
  );
}
