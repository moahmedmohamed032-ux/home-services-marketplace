import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Technicians from './pages/Technicians';
import TechnicianDetails from './pages/TechnicianDetails';
import Login from './pages/Login';
import Register from './pages/Register';
import ClientDashboard from './pages/ClientDashboard';
import TechnicianDashboard from './pages/TechnicianDashboard';

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/technicians/:id" element={<TechnicianDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute role="client">
                <ClientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pro"
            element={
              <ProtectedRoute role="technician">
                <TechnicianDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>Fanni — Home Services Marketplace · Built with React, Redux, Node.js &amp; Express</p>
      </footer>
    </>
  );
}
