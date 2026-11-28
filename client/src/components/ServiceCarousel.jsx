import { Link } from 'react-router-dom';
import { useT } from '../i18n/useT';

// Shown under a "no technicians" message. Explains what FIX-IT offers and invites sign-up. It never says a
// technician is available: availability depends on approved technicians in the customer's area.
const SERVICES = [
  { id: 'plumber', icon: '🔧', ar: 'سباكة', en: 'Plumbing', dAr: 'تسريب مياه، تركيب وصيانة أدوات صحية.', dEn: 'Leaks, fitting and repairing fixtures.' },
  { id: 'electrician', icon: '⚡', ar: 'كهرباء', en: 'Electrical', dAr: 'أعطال كهرباء، مفاتيح ولمبات وتمديدات.', dEn: 'Faults, switches, lighting and wiring.' },
  { id: 'ac-technician', icon: '❄️', ar: 'تكييف', en: 'AC', dAr: 'تركيب وصيانة وتنظيف التكييفات.', dEn: 'AC installation, servicing and cleaning.' },
  { id: 'painter', icon: '🎨', ar: 'نقاشة', en: 'Painting', dAr: 'دهان الحيطان والأسقف.', dEn: 'Wall and ceiling painting.' },
  { id: 'carpenter', icon: '🪚', ar: 'نجارة', en: 'Carpentry', dAr: 'أبواب وشبابيك وأثاث.', dEn: 'Doors, windows and furniture.' },
  { id: 'appliance-repair', icon: '🛠️', ar: 'صيانة أجهزة', en: 'Appliance repair', dAr: 'غسالات وتلاجات وأجهزة منزلية.', dEn: 'Washers, fridges and home appliances.' },
  { id: 'cleaner', icon: '🧹', ar: 'نظافة', en: 'Cleaning', dAr: 'تنظيف المنازل والمكاتب.', dEn: 'Home and office cleaning.' },
  { id: 'tiler', icon: '🧱', ar: 'بلاط', en: 'Tiling', dAr: 'تركيب وصيانة البلاط والسيراميك.', dEn: 'Tile and ceramic fitting and repair.' },
  { id: 'delivery', icon: '🛵', ar: 'توصيل طلبات', en: 'Delivery', dAr: 'طيار يشتري أو يستلم طلبك ويوصله.', dEn: 'A courier buys or collects your order and delivers it.' },
];

export default function ServiceCarousel() {
  const { lang } = useT();
  const ar = lang === 'ar';
  return (
    <section className="svc-carousel" aria-label={ar ? 'خدمات FIX-IT' : 'FIX-IT services'}>
      <div className="svc-frame">
        <div className="svc-inner">
          <h3 className="svc-title">{ar ? 'سجل وفعل موقعك واطلب خدمتك، احنا في خدمتك' : 'Sign up, turn on your location and request your service. We are at your service.'}</h3>
          <div className="svc-track" tabIndex={0}>
            {SERVICES.map((s, i) => (
              <article key={s.id} className="svc-card" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="svc-icon" aria-hidden="true">{s.icon}</span>
                <strong>{ar ? s.ar : s.en}</strong>
                <span className="muted">{ar ? s.dAr : s.dEn}</span>
              </article>
            ))}
          </div>
          <p className="muted svc-note">{ar ? 'الفنيين بيظهروا في كل منطقة بعد ما الإدارة تعتمدهم.' : 'Technicians appear in each area once they are approved.'}</p>
          <p><Link to="/register/client" className="btn btn-accent">{ar ? 'سجل دلوقتي' : 'Sign up'}</Link></p>
        </div>
      </div>
    </section>
  );
}
