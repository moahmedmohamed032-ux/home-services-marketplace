import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Terms, Privacy, Contact, SUPPORT_WHATSAPP } from './pages/LegalPages';
import Navbar from './components/Navbar';
import ChangePassword from './pages/ChangePassword';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Technicians from './pages/Technicians';
import TechnicianDetails from './pages/TechnicianDetails';
import Login from './pages/Login';
import RegisterClient from './pages/RegisterClient';
import RegisterTechnician from './pages/RegisterTechnician';
import ClientDashboard from './pages/ClientDashboard';
import TechnicianDashboard from './pages/TechnicianDashboard';
import NearestRequest from './pages/NearestRequest';
import ServiceLanding from './pages/ServiceLanding';
import AdminDashboard from './pages/AdminDashboard';
import { DentalHome, ClinicPage, ClinicRegister } from './dental/Dental';
import DentalAdmin from './dental/DentalAdmin';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from './i18n/useT';

export default function App() {
  const { t, lang } = useT();
  const { pathname } = useLocation();
  useEffect(() => {
    if (/^\/(luxor|esna|qena|aswan|dental)(\/|$)/.test(pathname)) return;
    const key = pathname === '/' ? 'home' : pathname.startsWith('/technicians') ? 'find'
      : pathname.startsWith('/login') ? 'login' : pathname.startsWith('/register') ? 'signup'
      : pathname.startsWith('/admin') ? 'admin' : 'dashboard';
    document.title = pathname === '/'
      ? (lang === 'ar' ? 'فني في الأقصر وإسنا وقنا وأسوان: سباك وكهربائي وفني تكييف | FIX-IT' : 'Technicians in Luxor, Esna, Qena and Aswan | FIX-IT')
      : `${t(key)} | FIX-IT`;
    const desc = lang === 'ar'
      ? 'محتاج فني في الأقصر أو إسنا أو قنا أو أسوان؟ اطلب سباك الأقصر أو كهربائي الأقصر أو فني تكييف الأقصر أو نجار ونقاش بتقييمات حقيقية. احجز في دقايق وادفع كاش أو أونلاين.'
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
          <Route path="/luxor/:slug" element={<ServiceLanding city="luxor" />} />
          <Route path="/esna/:slug" element={<ServiceLanding city="esna" />} />
          <Route path="/qena/:slug" element={<ServiceLanding city="qena" />} />
          <Route path="/aswan/:slug" element={<ServiceLanding city="aswan" />} />
          <Route path="/dental" element={<DentalHome />} />
          <Route path="/dental/register" element={<ClinicRegister />} />
          <Route path="/dental/clinic/:id" element={<ClinicPage />} />
          <Route path="/dental/:slug" element={<DentalHome />} />
          <Route path="/admin/dental" element={<ProtectedRoute role="admin"><DentalAdmin /></ProtectedRoute>} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/request-nearest" element={<NearestRequest />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/technicians/:id" element={<TechnicianDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Navigate to="/register/client" replace />} />
          <Route path="/register/client" element={<RegisterClient />} />
          <Route path="/register/technician" element={<RegisterTechnician />} />
          <Route path="/dashboard" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
          <Route path="/pro" element={<ProtectedRoute role="technician"><TechnicianDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/account/password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer"><p>{t('footer')}</p><p><Link to="/terms">شروط الاستخدام</Link> · <Link to="/privacy">سياسة الخصوصية</Link>{SUPPORT_WHATSAPP && <> · <Link to="/contact">تواصل معنا</Link></>}</p></footer>
    </>
  );
}
