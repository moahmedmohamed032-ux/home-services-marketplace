import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';

// Guards a route by session and role; sends everyone else to /login.
export default function ProtectedRoute({ role, children }) {
  const { user, token } = useSelector((s) => s.auth);
  const location = useLocation();
  if (!token || !user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'technician' ? '/pro' : '/dashboard'} replace />;
  }
  return children;
}
