import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProfessions } from '../features/technicians/techniciansSlice';
import { useT } from '../i18n/useT';

// "Order something": the customer writes what they need and from where; the request goes to the nearest
// delivery couriers through the normal nearest-technician flow. FIX-IT does not talk to shops and has no
// shop API: the courier buys or collects the items. Nothing is shown as available unless couriers exist.
export default function Orders() {
  const { lang } = useT();
  const ar = lang === 'ar';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const professions = useSelector((s) => s.technicians.professions);
  const [form, setForm] = useState({ items: '', from: '' });
  useEffect(() => { dispatch(fetchProfessions()); }, [dispatch]);
  const couriers = (professions.find((p) => p.id === 'delivery') || {}).technicianCount || 0;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const description = `${ar ? 'المطلوب' : 'Items'}: ${form.items.trim()}\n${ar ? 'من' : 'From'}: ${form.from.trim()}`;
    navigate(`/request-nearest?profession=delivery&description=${encodeURIComponent(description)}`);
  };

  return (
    <div className="card booking-form" style={{ marginTop: 16 }}>
      <h1>🛵 {ar ? 'اطلب من أي مكان' : 'Order from anywhere'}</h1>
      <p className="muted">
        {ar
          ? 'اكتب اللي محتاجه وهنبعت طلبك لأقرب طيارين توصيل. اللي يوافق بيظهر سعر التوصيلة وإنت تختار.'
          : 'Write what you need and we send your request to the nearest delivery couriers. Those who accept show their delivery price and you choose.'}
      </p>
      <ul className="muted" style={{ paddingInlineStart: 18 }}>
        <li>{ar ? 'FIX-IT مش مربوط بمطاعم أو صيدليات أو هايبرات، والطيار هو اللي بيشتري أو يستلم الطلب لحسابك.' : 'FIX-IT is not connected to restaurants, pharmacies or supermarkets. The courier buys or collects the items for you.'}</li>
        <li>{ar ? 'ثمن المشتريات بتحاسب عليه الطيار أو المحل مباشرة كاش. المبلغ اللي الطيار بيسجله في الفاتورة هو أجرة التوصيل بس.' : 'You pay the courier or the shop directly in cash for the goods. The amount the courier records on the invoice is the delivery fee only.'}</li>
        <li>{ar ? 'رسوم خدمة FIX-IT 6% على أجرة التوصيل، زي باقي الخدمات. الدفع كاش، والدفع الإلكتروني لسه مش شغال.' : 'The FIX-IT service fee is 6% of the delivery fee, like other services. Payment is cash; online payment is not live yet.'}</li>
        <li>{ar ? 'ممنوع طلب أي حاجة مخالفة للقانون (أدوية بتحتاج روشتة لازم الروشتة تتسلم للصيدلي).' : 'Nothing illegal. Prescription medicines need a prescription handed to the pharmacist.'}</li>
      </ul>
      {couriers === 0 ? (
        <div className="notice err">
          {ar ? 'لسه مفيش طيارين توصيل مسجلين ومعتمدين على الموقع. الخدمة هتشتغل أول ما يبقى فيه طيارين.' : 'There are no registered, approved delivery couriers yet. The service starts once there are.'}
          {' '}<Link to="/register/technician">{ar ? 'سجّل كطيار' : 'Register as a courier'}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="form">
          <label>{ar ? 'المطلوب (اكتب كل حاجة وكميتها)' : 'What you need (items and quantities)'}
            <textarea required rows="4" maxLength="500" value={form.items} onChange={set('items')} />
          </label>
          <label>{ar ? 'من فين (اسم المطعم أو الصيدلية أو المحل)' : 'From where (restaurant, pharmacy or shop name)'}
            <input required maxLength="120" value={form.from} onChange={set('from')} />
          </label>
          <button className="btn btn-primary">{ar ? 'التالي: اختار الموقع والتاريخ' : 'Next: location and date'}</button>
        </form>
      )}
    </div>
  );
}
