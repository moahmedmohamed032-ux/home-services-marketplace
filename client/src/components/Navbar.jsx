import { useDispatch, useSelector } from 'react-redux';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../features/auth/authSlice';

export default function Navbar() {
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          Fanni<span className="brand-dot">.</span>
        </Link>
        <div className="nav-links">
          <NavLink to="/technicians">Find a technician</NavLink>
          {user?.role === 'client' && <NavLink to="/dashboard">My bookings</NavLink>}
          {user?.role === 'technician' && <NavLink to="/pro">Pro dashboard</NavLink>}
        </div>
        <div className="nav-actions">
          {!user ? (
            <>
              <Link to="/login" className="btn btn-ghost">Log in</Link>
              <Link to="/register" className="btn btn-primary">Sign up</Link>
            </>
          ) : (
            <>
              <span className="nav-user">Hi, {user.name.split(' ')[0]}</span>
              <button className="btn btn-ghost" onClick={onLogout}>Log out</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
