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
import AdminDashboard from './pages/AdminDashboard';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from './i18n/useT';

export default function App() {
  const { t, lang } = useT();
  const { pathname } = useLocation();
  useEffect(() => {
    const key = pathname === '/' ? 'home' : pathname.startsWith('/technicians') ? 'find'
      : pathname.startsWith('/login') ? 'login' : pathname.startsWith('/register') ? 'signup'
      : pathname.startsWith('/admin') ? 'admin' : 'dashboard';
    document.title = pathname === '/'
      ? (lang === 'ar' ? 'فني في الأقصر: سباك وكهربائي وفني تكييف | FIX-IT' : 'Technicians in Luxor: plumber, electrician, AC | FIX-IT')
      : `${t(key)} | FIX-IT`;
    const desc = lang === 'ar'
      ? 'محتاج فني في الأقصر؟ اطلب سباك الأقصر أو كهربائي الأقصر أو فني تكييف الأقصر أو نجار ونقاش بتقييمات حقيقية. احجز في دقايق وادفع كاش أو أونلاين.'
      : 'Need a technician in Luxor? Book rated plumbers, electricians, AC technicians, carpenters and painters in minutes. Pay cash or online.';
    const m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute('content', desc);
    document.documentElement.lang = lang;
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
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer"><p>{t('footer')}</p></footer>
    </>
  );
}
