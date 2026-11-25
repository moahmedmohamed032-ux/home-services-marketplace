import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchTechnician } from '../features/technicians/techniciansSlice';
import { createBooking } from '../features/bookings/bookingsSlice';
import Stars from '../components/Stars';

export default function TechnicianDetails() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { current: t } = useSelector((s) => s.technicians);
  const { user } = useSelector((s) => s.auth);

  const [form, setForm] = useState({ date: '', description: '', address: '' });
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchTechnician(id));
  }, [dispatch, id]);

  if (!t) return <p className="muted">Loading…</p>;

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: { pathname: `/technicians/${id}` } } });
    setSubmitting(true);
    setMessage(null);
    const result = await dispatch(createBooking({ technicianId: id, ...form }));
    setSubmitting(false);
    if (result.meta.requestStatus === 'fulfilled') {
      setMessage({ ok: true, text: 'Booking sent! Track it from your dashboard.' });
      setForm({ date: '', description: '', address: '' });
    } else {
      setMessage({ ok: false, text: result.payload });
    }
  };

  return (
    <div className="details-layout">
      <div className="card tech-profile">
        <div className="tech-card-head">
          <div className="avatar avatar-lg">{t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
          <div>
            <h1>{t.name}</h1>
            <p className="muted">{t.city} · {t.yearsExperience} years experience</p>
          </div>
        </div>
        <Stars rating={t.rating} />
        <p>{t.bio}</p>
        <div className="stats-row">
          <div><strong>{t.jobsDone}</strong><span>jobs done</span></div>
          <div><strong>{t.hourlyRate} EGP</strong><span>per hour</span></div>
          <div><strong>{t.yearsExperience}</strong><span>years</span></div>
        </div>
      </div>

      <div className="card booking-form">
        <h2>Book {t.name.split(' ')[0]}</h2>
        {user?.role === 'technician' ? (
          <p className="muted">Technician accounts can't place bookings. Open a client account to book.</p>
        ) : (
          <form onSubmit={submit}>
            <label>
              Date
              <input type="date" required value={form.date} onChange={update('date')} />
            </label>
            <label>
              Describe the job
              <textarea required rows="3" placeholder="e.g. Kitchen sink is leaking under the cabinet…" value={form.description} onChange={update('description')} />
            </label>
            <label>
              Address
              <input type="text" required placeholder="Street, building, apartment" value={form.address} onChange={update('address')} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : user ? 'Send booking request' : 'Log in to book'}
            </button>
            {message && <p className={message.ok ? 'notice ok' : 'notice err'}>{message.text}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
