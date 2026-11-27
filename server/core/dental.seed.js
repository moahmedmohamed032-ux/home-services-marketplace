// Dental price-range guide. Every range comes from prices PUBLISHED by clinics/directories (2026),
// min/max = lowest and highest figure found across the sources. These are market ranges, not offers.
// Only figures actually found in the cited pages are used; nothing is invented.
const S = {
  medikawi: 'https://www.medicawy.com',
  okshif: 'https://ekshef.com',
  aman: 'https://amandental.com',
  premia: 'https://premiadental.com',
  drnour: 'https://dr-nour.com/ar/blog/%D8%A3%D9%86%D9%88%D8%A7%D8%B9-%D8%AD%D8%B4%D9%88-%D8%A7%D9%84%D8%A3%D8%B3%D9%86%D8%A7%D9%86-%D9%88%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1%D9%87%D8%A7/',
  drnourWhite: 'https://dr-nour.com/ar/blog/%D8%B3%D8%B9%D8%B1-%D8%AC%D9%84%D8%B3%D8%A9-%D8%AA%D8%A8%D9%8A%D9%8A%D8%B6-%D8%A7%D9%84%D8%A7%D8%B3%D9%86%D8%A7%D9%86/',
  ammar: 'https://www.drammar-clinics.com/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%AD%D8%B4%D9%88-%D8%B9%D8%B5%D8%A8-%D8%A7%D9%84%D8%B6%D8%B1%D8%B3',
  ammarExt: 'https://www.drammar-clinics.com/en/how-much-does-tooth-extraction-cost-in-egypt',
  ammarZr: 'https://www.drammar-clinics.com/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%AA%D8%B1%D9%83%D9%8A%D8%A8-%D8%A7%D9%84%D8%A7%D8%B3%D9%86%D8%A7%D9%86-%D8%A7%D9%84%D8%B2%D9%8A%D8%B1%D9%83%D9%88%D9%86-%D9%81%D9%8A-%D9%85%D8%B5%D8%B1',
  amanFill: 'https://amandental.com/%D8%B3%D8%B9%D8%B1-%D8%A7%D9%84%D8%AD%D8%B4%D9%88-%D8%A7%D9%84%D8%B9%D8%A7%D8%AF%D9%8A',
  amanClean: 'https://amandental.com/%D8%A3%D8%B3%D8%B9%D8%A7%D8%B1-%D8%AA%D9%86%D8%B8%D9%8A%D9%81-%D8%A7%D9%84%D8%A3%D8%B3%D9%86%D8%A7%D9%86',
  amanZr: 'https://amandental.com/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%AA%D8%B1%D9%83%D9%8A%D8%A8-%D8%A7%D9%84%D8%A7%D8%B3%D9%86%D8%A7%D9%86-%D8%A7%D9%84%D8%B2%D9%8A%D8%B1%D9%83%D9%88%D9%86-%D9%81%D9%8A-%D9%85%D8%B5%D8%B1',
  profClean: 'https://professorsdentalclinic.com/%d9%83%d9%85-%d8%b3%d8%b9%d8%b1-%d8%aa%d9%86%d8%b8%d9%8a%d9%81-%d8%a7%d9%84%d8%a3%d8%b3%d9%86%d8%a7%d9%86-%d9%85%d9%86-%d8%a7%d9%84%d8%ac%d9%8a%d8%b1/',
  profZr: 'https://professorsdentalclinic.com/%d8%aa%d8%b1%d9%83%d9%8a%d8%a8%d8%a7%d8%aa-%d8%a3%d8%b3%d9%86%d8%a7%d9%86-%d8%a7%d9%84%d8%b2%d9%8a%d8%b1%d9%83%d9%88%d9%86/',
  khaledExt: 'https://drkhaleddental.com/ar/%d8%aa%d9%83%d9%84%d9%81%d8%a9-%d8%ae%d9%84%d8%b9-%d8%b6%d8%b1%d8%b3-%d8%a7%d9%84%d8%b9%d9%82%d9%84-%d9%81%d9%8a-%d9%85%d8%b5%d8%b1/',
  guarantee: 'https://guarantee-dental.net/%d8%a7%d8%b3%d8%b9%d8%a7%d8%b1-%d8%ad%d8%b4%d9%88-%d8%a7%d9%84%d8%a7%d8%b3%d9%86%d8%a7%d9%86/',
  webdental: 'https://www.webdental.online/%D8%B3%D8%B9%D8%B1-%D8%AD%D8%B4%D9%88-%D8%A7%D9%84%D8%B6%D8%B1%D8%B3-%D8%A7%D9%84%D8%B9%D8%A7%D8%AF%D9%8A',
  drmaher: 'https://dr-maher.com/%D8%AA%D8%B1%D9%83%D9%8A%D8%A8%D8%A7%D8%AA-%D8%A7%D9%84%D8%A3%D8%B3%D9%86%D8%A7%D9%86/',
  fahmy: 'https://dentistmohamedfahmy.com',
};
const src = (name, url, note) => ({ name, url, note });

const PROCEDURES = [
  { id: 'checkup', slug: 'checkup', nameAr: 'كشف أسنان', icon: '🦷', min: 100, max: 200, order: 1,
    descAr: 'الكشف الأولي والاستشارة وتحديد الحالة. بعض العيادات بتقدم الكشف الأولي مجانًا في عروض.',
    sources: [src('Medikawi - كشف في الأقصر 200 ج', S.medikawi), src('Okshif - متوسط كشف في قنا حوالي 100 ج', S.okshif)] },
  { id: 'cleaning', slug: 'cleaning', nameAr: 'تنظيف الأسنان وإزالة الجير', icon: '✨', min: 300, max: 3000, order: 2,
    descAr: 'جلسة إزالة الجير والتلميع. السعر بيختلف حسب كمية الجير وهل فيه علاج لثة.',
    sources: [src('عرض في أرمنت 300 ج', S.okshif), src('عيادة د. محمد فهمي: من 400 ج', S.fahmy), src('أمان: من 700 ج', S.amanClean), src('Guarantee Dental: من 750 ج', S.guarantee), src('Professors: 1,000-3,000 ج', S.profClean)] },
  { id: 'filling', slug: 'filling', nameAr: 'حشو الأسنان (حشو عادي / كومبوزيت)', icon: '🧱', min: 500, max: 3500, order: 3,
    descAr: 'علاج التسوس البسيط. الأملغم الأرخص، والكومبوزيت بلون السن أغلى.',
    sources: [src('Webdental: بلاتين 500-700، أبيض 1,250-1,750 ج', S.webdental), src('أمان: من 1,250 ج', S.amanFill), src('Guarantee Dental: 500-2,500 ج', S.guarantee), src('د. نور: كومبوزيت 3,000-3,500 ج', S.drnour)] },
  { id: 'root-canal', slug: 'root-canal', nameAr: 'علاج العصب (حشو العصب)', icon: '🩺', min: 1500, max: 6500, order: 4,
    descAr: 'علاج جذور السن. الأمامي أرخص من الضرس الخلفي، وغالبًا على جلسة أو أكتر.',
    sources: [src('Guarantee Dental: 1,500-3,000 ج', S.guarantee), src('د. عمار: أمامي 2,000-3,000، خلفي 4,000-5,500 ج', S.ammar), src('د. نور: 3,500-5,500 ج', S.drnour), src('Premia: حوالي 2,000-6,500 ج', S.premia)] },
  { id: 'extraction', slug: 'extraction', nameAr: 'خلع عادي', icon: '🪥', min: 800, max: 2000, order: 5,
    descAr: 'خلع سن أو ضرس ظاهر بشكل بسيط.',
    sources: [src('د. خالد: خلع عادي 800-2,000 ج', S.khaledExt), src('د. عمار: خلع عادي 1,000-1,500 ج', S.ammarExt)] },
  { id: 'surgical-extraction', slug: 'surgical-extraction', nameAr: 'خلع جراحي (ضرس العقل المدفون)', icon: '🏥', min: 2500, max: 6000, order: 6,
    descAr: 'خلع ضرس العقل المدفون أو الحالات المعقدة. بيحتاج أشعة وتقدير بعد الكشف.',
    sources: [src('د. خالد: جراحي 2,500-6,000 ج', S.khaledExt), src('أمان: من 3,000 ج', S.aman), src('د. عمار: 3,500-5,500 ج', S.ammarExt)] },
  { id: 'crown', slug: 'crown', nameAr: 'تلبيس / طربوش زيركون', icon: '👑', min: 3500, max: 8500, order: 7,
    descAr: 'سعر السن الواحدة. بيختلف حسب الخامة (صيني، كوري، ألماني) وحالة السن.',
    sources: [src('د. ماهر: 3,500 ج', S.drmaher), src('أمان: من 4,000 ج (زيركون ألماني)', S.amanZr), src('Professors: 5,000-8,500 ج', S.profZr), src('د. عمار: 5,000-8,500 ج', S.ammarZr)] },
  { id: 'whitening', slug: 'whitening', nameAr: 'تبييض الأسنان', icon: '😁', min: 500, max: 10000, order: 8,
    descAr: 'الفرق كبير بين جلسة بسيطة وتبييض بالجهاز في العيادة. اسأل العيادة إيه اللي بيشمله السعر.',
    sources: [src('د. عمار: من 500 ج للجلسة وحتى 8,500 ج', 'https://www.drammar-clinics.com/en/types-of-teeth-whitening-and-their-prices'), src('د. نور: 8,000-10,000 ج', S.drnourWhite)] },
];

const DENTAL_CITIES = ['Luxor', 'Armant', 'Esna', 'Qena', 'Aswan'];
const CITY_AR = { Luxor: 'الأقصر', Armant: 'أرمنت', Esna: 'إسنا', Qena: 'قنا', Aswan: 'أسوان' };
const UPDATED = '2026-11-27';
module.exports = { PROCEDURES, DENTAL_CITIES, CITY_AR, UPDATED };
