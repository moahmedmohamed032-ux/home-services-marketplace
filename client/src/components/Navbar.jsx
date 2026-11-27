import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../features/auth/authSlice';
import { toggleLang, toggleTheme } from '../features/ui/uiSlice';
import NotificationBell from './NotificationBell';
import { useT } from '../i18n/useT';
import { useDentalEnabled } from '../dental/Dental';

export default function Navbar() {
  const { user } = useSelector((s) => s.auth);
  const theme = useSelector((s) => s.ui.theme);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useT();
  const dentalOn = useDentalEnabled();
  const dash = user && (user.role === 'technician' ? '/pro' : user.role === 'admin' ? '/admin' : '/dashboard');

  return (
    <header className="navbar">
      <div className="container nav-inner">
        <Link to="/" className="brand"><span className="brand-mark">🛠</span>{t('brand')}</Link>
        <nav className="nav-links">
          <NavLink to="/" end>{t('home')}</NavLink>
          <NavLink to="/technicians">{t('find')}</NavLink>
          {dentalOn && <NavLink to="/dental">🦷 أسنان</NavLink>}
        </nav>
        <div className="nav-actions">
          <button className="icon-btn" onClick={() => dispatch(toggleLang())} aria-label="language">{t('language')}</button>
          <button className="icon-btn" onClick={() => dispatch(toggleTheme())} aria-label={t('theme')} title={t('theme')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {user ? (
            <>
              <NotificationBell />
              <Link to={dash} className="btn btn-primary dash-btn">▦ {t('dashboard')}</Link>
              <button className="btn btn-ghost" onClick={() => { dispatch(logout()); navigate('/'); }}>{t('logout')}</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">{t('login')}</Link>
              <Link to="/register/client" className="btn btn-primary">{t('signup')}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
