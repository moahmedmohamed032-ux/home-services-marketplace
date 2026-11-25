import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyBookings, reviewBooking, updateBookingStatus } from '../features/bookings/bookingsSlice';

const STATUS_LABEL = {
  pending: 'Waiting for the technician',
  accepted: 'Accepted — scheduled',
  declined: 'Declined by the technician',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function ClientDashboard() {
  const dispatch = useDispatch();
  const { mine } = useSelector((s) => s.bookings);
  const [reviewDraft, setReviewDraft] = useState({}); // bookingId -> {rating, comment}

  useEffect(() => {
    dispatch(fetchMyBookings());
  }, [dispatch]);

  const cancel = (id) => dispatch(updateBookingStatus({ id, status: 'cancelled' }));

  const submitReview = async (id) => {
    const draft = reviewDraft[id] || {};
    await dispatch(reviewBooking({ id, rating: Number(draft.rating), comment: draft.comment }));
    setReviewDraft({ ...reviewDraft, [id]: undefined });
  };

  return (
    <>
      <h1 className="page-title">My bookings</h1>
      {mine.length === 0 && <p className="muted">No bookings yet — find a technician to get started.</p>}
      <div className="booking-list">
        {mine.map((b) => (
          <div key={b.id} className="card booking-card">
            <div className="booking-head">
              <div>
                <h3>{b.technicianName}</h3>
                <p className="muted">{b.profession} · {new Date(b.date).toLocaleDateString()}</p>
              </div>
              <span className={`badge status-${b.status}`}>{b.status}</span>
            </div>
            <p>{b.description}</p>
            <p className="muted">{b.address}</p>
            <p className="muted small">{STATUS_LABEL[b.status]}</p>

            {['pending', 'accepted'].includes(b.status) && (
              <button className="btn btn-ghost" onClick={() => cancel(b.id)}>Cancel booking</button>
            )}

            {b.status === 'completed' && !b.review && (
              <div className="review-box">
                <h4>Rate the work</h4>
                <div className="field-row">
                  <select
                    value={reviewDraft[b.id]?.rating || ''}
                    onChange={(e) => setReviewDraft({ ...reviewDraft, [b.id]: { ...reviewDraft[b.id], rating: e.target.value } })}
                  >
                    <option value="">Rating…</option>
                    {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{'★'.repeat(r)}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Short comment (optional)"
                    value={reviewDraft[b.id]?.comment || ''}
                    onChange={(e) => setReviewDraft({ ...reviewDraft, [b.id]: { ...reviewDraft[b.id], comment: e.target.value } })}
                  />
                </div>
                <button className="btn btn-primary" disabled={!reviewDraft[b.id]?.rating} onClick={() => submitReview(b.id)}>
                  Submit review
                </button>
              </div>
            )}

            {b.review && <p className="notice ok">You rated this job {'★'.repeat(b.review.rating)}{b.review.comment ? ` — “${b.review.comment}”` : ''}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
