import { useLocation, useNavigate } from 'react-router-dom';
import RegisterClient from './RegisterClient';
import RegisterTechnician from './RegisterTechnician';
import { useT } from '../i18n/useT';

// One sign-up page: a client / technician toggle on top, the matching form below.
export default function Register() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { lang } = useT();
  const role = pathname.startsWith('/register/technician') ? 'technician' : 'client';
  const opts = [['client', lang === 'ar' ? '👤 عميل' : '👤 Client'], ['technician', lang === 'ar' ? '🔧 فني' : '🔧 Technician']];
  return (
    <>
      <div className="role-toggle" role="tablist" aria-label={lang === 'ar' ? 'نوع الحساب' : 'Account type'}>
        {opts.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={role === k} className={role === k ? 'on' : ''} onClick={() => role !== k && navigate(`/register/${k}`, { replace: true })}>{label}</button>
        ))}
      </div>
      {role === 'technician' ? <RegisterTechnician /> : <RegisterClient />}
    </>
  );
}
