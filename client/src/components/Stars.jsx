export default function Stars({ rating = 0 }) {
  const full = Math.round(rating);
  return (
    <span className="stars" title={`${rating} out of 5`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
      <span className="stars-num">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
    </span>
  );
}
