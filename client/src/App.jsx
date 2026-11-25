import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Technicians from './pages/Technicians';
import TechnicianDetails from './pages/TechnicianDetails';
import Login from './pages/Login';
import RegisterClient from './pages/RegisterClient';
import RegisterTechnician from './pages/RegisterTechnician';
import ClientDashboard from './pages/ClientDashboard';
import TechnicianDashboard from './pages/TechnicianDashboard';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from './i18n/useT';

export default function App() {
  const { t, lang } = useT();
  const { pathname } = useLocation();
  useEffect(() => {
    const key = pathname === '/' ? 'home' : pathname.startsWith('/technicians') ? 'find'
      : pathname.startsWith('/login') ? 'login' : pathname.startsWith('/register') ? 'signup' : 'dashboard';
    document.title = pathname === '/'
      ? (lang === 'ar' ? 'FIX-IT | اعثر على أقرب فني بأعلى تقييم' : 'FIX-IT | Find the nearest plumber, electrician and home technician')
      : `${t(key)} | FIX-IT`;
  }, [pathname, lang]);
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/technicians/:id" element={<TechnicianDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Navigate to="/register/client" replace />} />
          <Route path="/register/client" element={<RegisterClient />} />
          <Route path="/register/technician" element={<RegisterTechnician />} />
          <Route path="/dashboard" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
          <Route path="/pro" element={<ProtectedRoute role="technician"><TechnicianDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer"><p>{t('footer')}</p></footer>
    </>
  );
}
