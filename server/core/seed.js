// Seed data: professions and a realistic spread of Egyptian technicians with
// districts, varied ratings and natural client reviews. Also the demo client,
// demo technician and the site admin account (credentials documented in the
// README only), plus a few demo bookings and invoices so the dashboards and
// the admin view open with real-looking activity.
const PROFESSIONS = [
  { id: 'plumber', priceMin: 80, priceMax: 200, name: 'Plumber', nameAr: 'سباك', icon: '🔧' },
  { id: 'electrician', priceMin: 80, priceMax: 220, name: 'Electrician', nameAr: 'كهربائي', icon: '⚡' },
  { id: 'painter', priceMin: 70, priceMax: 180, name: 'Painter', nameAr: 'نقاش', icon: '🎨' },
  { id: 'carpenter', priceMin: 80, priceMax: 200, name: 'Carpenter', nameAr: 'نجار', icon: '🪚' },
  { id: 'ac-technician', priceMin: 100, priceMax: 250, name: 'AC Technician', nameAr: 'فني تكييف', icon: '❄️' },
  { id: 'cleaner', priceMin: 50, priceMax: 130, name: 'Cleaner', nameAr: 'عامل نظافة', icon: '🧹' },
  { id: 'appliance-repair', priceMin: 80, priceMax: 200, name: 'Appliance Repair', nameAr: 'صيانة أجهزة', icon: '🛠️' },
  { id: 'tiler', priceMin: 70, priceMax: 180, name: 'Tiler', nameAr: 'بلاط', icon: '🧱' },
];

// Reference coordinates per city (center); technicians are jittered around it.
const CITY_COORDS = {
  Luxor: { lat: 25.6872, lng: 32.6396 },
  Cairo: { lat: 30.0444, lng: 31.2357 },
};

const SERVICE_FEE_EGP = 25;

// Reviews: [clientName, rating, comment (EN), commentAr (AR), month, day]
const TECHNICIANS = [
  {
    name: 'Mahmoud Abdallah', profession: 'plumber', city: 'Cairo', district: 'Nasr City',
    yearsExperience: 12, hourlyRate: 180, jobsDone: 342, phone: '+20 100 234 8765', phonePublic: true,
    bio: 'Bathroom and kitchen plumbing, leak detection and full repiping across Nasr City and New Cairo.',
    bioAr: 'سباكة حمامات ومطابخ، كشف تسريبات وتأسيس كامل في مدينة نصر والتجمع.',
    reviews: [
      ['Ahmed Samy', 5, 'Found the bathroom leak and fixed it within the hour, clean work and the agreed price.', 'رجل محترم، كشف التسريب في الحمام وظبطه في ساعة. شغل نضيف والسعر زي ما اتفقنا.', 2, 14],
      ['Dina M.', 5, 'Changed all the bathroom mixers, very clean work and right on time.', 'غير كل خلاطات الحمام، شغل نضيف جداً وجا في الميعاد بالظبط.', 4, 2],
      ['Mahmoud H.', 4, 'Arrived a bit late but the work is solid and the leak never came back.', 'جا متأخر شوية بس الشغل كويس والتسريبة معدتش.', 6, 19],
      ['Mona A.', 5, 'Did the full plumbing of my flat from scratch, followed up day by day. Highly recommended.', 'أسس سباكة الشقة كلها من الصفر، متابعة يوم بيوم. أنصح بيه جداً.', 8, 7],
      ['Karim', 4, 'Fair pricing, fixed the kitchen drain the same day.', 'سعر عادل، وسلك صرف المطبخ في نفس اليوم.', 10, 25],
    ],
  },
  {
    name: 'Ahmed El-Sayed', profession: 'electrician', city: 'Cairo', district: 'Heliopolis',
    yearsExperience: 9, hourlyRate: 200, jobsDone: 287, phone: '+20 111 540 2231', phonePublic: false,
    bio: 'Certified electrician: wiring, breaker panels, lighting and fault tracing for homes and offices.',
    bioAr: 'كهربائي معتمد: تأسيس وتشطيب كهربا، لوحات توزيع، إضاءة وكشف أعطال للشقق والمكاتب.',
    reviews: [
      ['Amr Saber', 5, 'Replaced the old breaker panel and balanced the loads, no more tripping at home.', 'غير لوحة الكهربا القديمة وظبط الأحمال، بيتي بقى مافيهوش فصل تاني.', 1, 22],
      ['Noha', 5, 'Very professional, installed all the lighting in my flat.', 'محترف جداً، ركب إضاءة الشقة كلها.', 5, 11],
      ['Islam M.', 4, 'Good work, just a bit pricier than others.', 'شغل كويس بس سعره غالي شوية عن غيره.', 7, 30],
      ['Heba Rizk', 5, 'Found a wiring fault that was inflating my bills for months. God bless him.', 'لقى عطل في التأسيس كان مكلفني فواتير عالية، ربنا يباركله.', 10, 8],
    ],
  },
  {
    name: 'Youssef Ramadan', profession: 'painter', city: 'Cairo', district: 'Maadi',
    yearsExperience: 15, hourlyRate: 150, jobsDone: 410, phone: '+20 122 873 0456', phonePublic: true,
    bio: 'Interior and exterior painting, decorative finishes and waterproof coatings. Maadi and surrounding areas.',
    bioAr: 'دهانات داخلية وخارجية، تشطيبات ديكورية وعزل مائي. المعادي والمناطق المجاورة.',
    reviews: [
      ['Mr. Hamdy', 5, 'Painted a 150 sqm flat, skim coat and finish at the highest level.', 'دهان شقة ١٥٠ متر، معجون وتشطيب على أعلى مستوى.', 2, 3],
      ['Sally A.', 5, 'The colors came out exactly like the catalogue, and he cleaned up before leaving.', 'الألوان طلعت زي الكتالوج بالظبط، ونضف مكانه قبل ما يمشي.', 4, 27],
      ['Mona', 4, 'Good work but took an extra day to finish.', 'شغل كويس بس خد يوم زيادة عن المتفق عليه.', 6, 15],
      ['Tarek Fouad', 4, 'Painted the reception only; nice work, the skim coat needed a firmer hand though.', 'دهن الريسبشن بس، الشغل حلو بس المعجون محتاج يد أقوى شوية.', 9, 5],
      ['Hend', 5, 'A tasteful, honest man. Left the flat furnished while he worked and nothing was touched.', 'راجل ذوق وأمين، ساب الشقة متفرشة وهو بيشتغل ومحدش قرب من حاجة.', 11, 1],
    ],
  },
  {
    name: 'Mohamed El-Gendy', profession: 'carpenter', city: 'Cairo', district: 'Shubra',
    yearsExperience: 18, hourlyRate: 170, jobsDone: 520, phone: '+20 100 918 3347', phonePublic: false,
    bio: 'Custom kitchens, wardrobes, doors and full woodwork restoration. Own workshop in Shubra.',
    bioAr: 'مطابخ ودواليب وأبواب تفصيل، وترميم أثاث كامل. ورشة خاصة في شبرا.',
    reviews: [
      ['Karim Salah', 5, 'A true artist, built me a full kitchen better than the ready-made ones.', 'أسطى محمد راجل فنان، عملي مطبخ كامل أحسن من الجاهز.', 3, 12],
      ['Rania', 5, 'Repaired my bedroom door and wardrobe, like new.', 'صلح باب الأوضة والدولاب، رجعوا زي الجديد.', 7, 21],
      ['Mahmoud Rizk', 4, 'Excellent work but appointments slip a day or two.', 'الشغل ممتاز بس المواعيد بتتأخر يوم يومين.', 10, 16],
    ],
  },
  {
    name: 'Tarek Mostafa', profession: 'tiler', city: 'Cairo', district: 'Helwan',
    yearsExperience: 14, hourlyRate: 160, jobsDone: 265, phone: '+20 115 602 7789', phonePublic: true,
    bio: 'Ceramic, porcelain and marble tiling with precise leveling and finishing. Bathrooms and full flats.',
    bioAr: 'تركيب سيراميك وبورسلين ورخام بميزان مظبوط وتشطيب نضيف. حمامات وشقق كاملة.',
    reviews: [
      ['Abu Mazen', 5, 'Tiled the whole flat, perfect leveling and even grout lines.', 'ركب سيراميك الشقة كلها، ميزان مظبوط وفواصل متساوية.', 2, 24],
      ['Heba', 4, 'Bathroom tiling, neat finishing.', 'بلاط الحمام، تشطيب نضيف.', 6, 9],
      ['Sameh', 5, 'Worked under time pressure and still delivered on schedule.', 'اشتغل تحت ضغط وقت وسلم في الميعاد.', 10, 29],
    ],
  },
  {
    name: 'Hassan Ibrahim', profession: 'plumber', city: 'Cairo', district: 'Dokki',
    yearsExperience: 7, hourlyRate: 150, jobsDone: 178, phone: '+20 101 447 9023', phonePublic: false,
    bio: 'Fast response for emergency leaks, water heater installs and drainage work around Dokki and Agouza.',
    bioAr: 'استجابة سريعة للتسريبات الطارئة، تركيب سخانات وأعمال صرف في الدقي والعجوزة.',
    reviews: [
      ['Ahmed Fathy', 4, 'Came the same day and fixed the heater. The drip came back a week later and he returned and fixed it for free.', 'جا في نفس اليوم وصلح السخان، التنقيط رجع بعد أسبوع فجا تاني وظبطه من غير فلوس.', 3, 18],
      ['Dalia', 3, 'OK work, a bit slow.', 'شغل مقبول، بس بطيء شوية.', 5, 26],
      ['Mostafa', 5, 'Reasonable price and respectful manners.', 'سعر معقول وتعامل محترم.', 9, 13],
    ],
  },
  {
    name: 'Nadia Fouad', profession: 'cleaner', city: 'Cairo', district: 'Zamalek',
    yearsExperience: 6, hourlyRate: 120, jobsDone: 433, phone: '+20 120 335 6618', phonePublic: true,
    bio: 'Deep cleaning for homes and offices, post-renovation and move-in packages. Zamalek, Mohandessin and Downtown.',
    bioAr: 'تنظيف عميق للشقق والمكاتب، تنظيف بعد التشطيب وقبل السكن. الزمالك والمهندسين ووسط البلد.',
    reviews: [
      ['Madam Sawsan', 5, 'Deep clean after renovation, the flat came back brand new.', 'تنظيف عميق بعد التشطيب، الشقة رجعت جديدة.', 1, 9],
      ['Sara', 5, 'Weekly cleaning, always on time and thorough.', 'تنظيف أسبوعي، دايماً في الميعاد وبضمير.', 4, 17],
      ['Reem', 5, 'Very clean work and polite manners.', 'بنظافة شديدة وذوق في التعامل.', 8, 22],
      ['Amani', 4, 'Cleaned the upholstery and carpets with good products.', 'عملت تنظيف الفرش والسجاد بخامات كويسة.', 10, 19],
    ],
  },
  {
    name: 'Sameh Adly', profession: 'appliance-repair', city: 'Cairo', district: 'Nasr City',
    yearsExperience: 11, hourlyRate: 190, jobsDone: 310, phone: '+20 111 209 8453', phonePublic: true,
    bio: 'Washers, fridges, ovens and dishwashers. Genuine parts with a 3-month warranty, home visits in Nasr City.',
    bioAr: 'صيانة غسالات وثلاجات وبوتاجازات. قطع غيار أصلية بضمان ٣ شهور، زيارات منزلية في مدينة نصر.',
    reviews: [
      ['Hatem', 5, 'Fixed the washer at home and replaced the pump with a 3-month warranty.', 'صلح الغسالة في البيت وغير الطرمبة بضمان ٣ شهور.', 2, 8],
      ['Nesma', 4, 'Fridge fixed the same day, genuine parts.', 'الثلاجة اتصلحت في نفس اليوم، قطع غيار أصلية.', 6, 27],
      ['Amr', 5, 'Clear expertise, diagnosed the fault in minutes.', 'خبرة واضحة، شخص العطل في دقايق.', 9, 30],
    ],
  },
  {
    name: 'Ahmed Samy', profession: 'electrician', city: 'Luxor', district: 'Karnak',
    yearsExperience: 10, hourlyRate: 150, jobsDone: 375, phone: '+20 100 764 2281', phonePublic: true,
    bio: 'Full wiring and finishing for houses and shops in Karnak and East Luxor. Safety inspections included.',
    bioAr: 'تأسيس وتشطيب كهربا للبيوت والمحلات في الكرنك وشرق الأقصر، مع فحص أمان كامل.',
    reviews: [
      ['Haj Abdel-Rahim', 5, 'Wired a whole floor of our house in Karnak, meticulous work.', 'أسس كهربا دور كامل في بيتنا بالكرنك، شغل متقن.', 1, 15],
      ['Mahmoud', 5, 'Found a wiring fault that two other electricians could not.', 'لقى عطل في التأسيس عجز عنه اتنين قبله.', 5, 20],
      ['Asmaa', 4, 'Respectful and committed to the appointment.', 'محترم وبيلتزم بالميعاد.', 8, 11],
    ],
  },
  {
    name: 'Salah Orabi', profession: 'appliance-repair', city: 'Luxor', district: 'Al Awameya',
    yearsExperience: 9, hourlyRate: 140, jobsDone: 246, phone: '+20 122 590 1374', phonePublic: false,
    bio: 'Home appliance repair in Al Awameya and Al Bayadeya: fridges, washers, water heaters and fans.',
    bioAr: 'صيانة أجهزة منزلية في العوامية والبياضية: ثلاجات وغسالات وسخانات ومراوح.',
    reviews: [
      ['Mohamed Awad', 5, 'The fridge stopped cooling, he came the same afternoon and fixed it.', 'الثلاجة بطلت تبرد، جا عصر نفس اليوم وظبطها.', 3, 5],
      ['Wael', 4, 'Honest pricing, fixed my washer.', 'أسعار أمينة، صلح الغسالة.', 6, 23],
      ['Hamada', 4, 'Original spare parts and he understands modern appliances.', 'قطع غيار أصلية وبيفهم في الأجهزة الحديثة.', 9, 17],
    ],
  },
  {
    name: 'Amr Khaled', profession: 'painter', city: 'Luxor', district: 'Al Bayadeya',
    yearsExperience: 6, hourlyRate: 100, jobsDone: 132, phone: '+20 101 883 5540', phonePublic: true,
    bio: 'Apartment and villa painting in Luxor, quick turnaround and clean delivery.',
    bioAr: 'دهان شقق وفلل في الأقصر، تسليم سريع ونضيف.',
    reviews: [
      ['Ibrahim', 4, 'Painted my flat before Eid, fast and clean delivery.', 'دهن شقتي قبل العيد، سرعة وتسليم نضيف.', 2, 19],
      ['Alaa', 4, 'Good for the price.', 'كويس بالنسبة لسعره.', 6, 6],
      ['Sayed', 4, 'Needs to polish his finishing a bit, but an honest man.', 'محتاج يحسن التشطيب شوية لكن راجل أمين.', 9, 25],
    ],
  },
  {
    name: 'Karim Fathy', profession: 'ac-technician', city: 'Luxor', district: 'Al Mahatta',
    yearsExperience: 8, hourlyRate: 170, jobsDone: 229, phone: '+20 115 374 9906', phonePublic: false,
    bio: 'Split and central AC installation, maintenance and Freon refill for all brands. Downtown Luxor and nearby.',
    bioAr: 'تركيب وصيانة تكييفات اسبليت ومركزي وشحن فريون لكل الماركات. وسط الأقصر والمناطق المجاورة.',
    reviews: [
      ['Mahmoud Abdel-Naby', 5, 'Installed two split units and refilled Freon, precise work.', 'ركب تكييفين اسبليت وشحن فريون، شغل مظبوط.', 3, 28],
      ['Mostafa', 5, 'AC cooling like new after the maintenance.', 'التكييف رجع يبرد زي الجديد بعد الصيانة.', 5, 14],
      ['Hesham', 4, 'An hour late to the appointment but excellent work.', 'اتأخر عن الميعاد ساعة لكن الشغل ممتاز.', 7, 9],
      ['Wafaa', 5, 'Cleaned and sanitized the indoor unit, made a real difference for us.', 'نضافة وتعقيم الوحدة الداخلية، فرق معايا جداً.', 10, 21],
    ],
  },
  {
    name: 'Hassan Ali Omar', profession: 'plumber', city: 'Luxor', district: 'Al Qarna',
    yearsExperience: 8, hourlyRate: 130, jobsDone: 164, phone: '+20 120 618 4427', phonePublic: true,
    bio: 'Plumbing and drainage for the West Bank villages: Al Qarna, Al Gezira and nearby. Emergency calls welcome.',
    bioAr: 'سباكة وصرف لقرى البر الغربي: القرنة والجزيرة وما حولها. نجدة طوارئ في أي وقت.',
    reviews: [
      ['Abdallah', 5, 'Unblocked the drains and solved a problem we had lived with for months.', 'سلك المجاري وحل مشكلة كانت قاعدة معانا شهور.', 4, 12],
      ['Khaled', 4, 'Quick response in the West Bank area.', 'استجابة سريعة في منطقة البر الغربي.', 8, 3],
    ],
  },
  {
    name: 'Omar Nasser', profession: 'carpenter', city: 'Luxor', district: 'Karnak',
    yearsExperience: 13, hourlyRate: 160, jobsDone: 298, phone: '+20 111 726 3095', phonePublic: false,
    bio: 'Custom furniture in beech and oak: bedrooms, kitchens and doors. Workshop in Karnak, delivery across Luxor.',
    bioAr: 'تفصيل أثاث زان وبلوط: غرف نوم ومطابخ وأبواب. ورشة في الكرنك وتسليم لكل الأقصر.',
    reviews: [
      ['Nagm', 5, 'Built a full beech bedroom set, work you can brag about.', 'عمل غرفة نوم كاملة خشب زان، شغل يتقال عليه.', 2, 27],
      ['Fatma', 5, 'Beautiful custom kitchen, delivered on time.', 'مطبخ تفصيل جميل، واتسلم في الميعاد.', 6, 18],
      ['Saber', 4, 'Slightly above market price but the quality is worth it.', 'سعر أعلى من السوق شوية بس الجودة تستاهل.', 10, 7],
    ],
  },
];

// Demo accounts (credentials documented in the README only).
const DEMO_CLIENT = { name: 'Ahmed Mohamed', email: 'client@demo.com', password: 'Demo@1234', role: 'client', city: 'Luxor' };
const DEMO_TECH = {
  name: 'Mostafa Kamel', email: 'tech@demo.com', password: 'Demo@1234', role: 'technician',
  profession: 'electrician', city: 'Luxor', district: 'Karnak', yearsExperience: 5, hourlyRate: 140, jobsDone: 96,
  phone: '+20 100 455 8213', phonePublic: false,
  bio: 'Electrician for homes and shops in Karnak and East Luxor. Maintenance, wiring and intercom systems.',
  bioAr: 'كهربائي للبيوت والمحلات في الكرنك وشرق الأقصر. صيانة وتأسيس وأنظمة إنتركم.',
  reviews: [
    ['Ahmed M.', 5, 'Fixed the intercom and changed the flat switches, good price.', 'ظبط الإنتركم وغير مفاتيح الشقة، سعر كويس.', 8, 16],
    ['Salma', 4, 'Fast and polite.', 'سريع ومحترم.', 10, 11],
  ],
};
const ADMIN = { name: 'Ahmed Mohamed', email: 'admin@demo.com', password: 'Demo@1234', role: 'admin', city: 'Luxor' };

// Demo bookings (client = demo client) so the dashboards and admin view open
// with real-looking activity. tech = index into TECHNICIANS.
const SEED_BOOKINGS = [
  {
    tech: 11, date: '2026-10-12', status: 'completed',
    description: 'Install a new split AC in the bedroom and refill Freon.',
    descriptionAr: 'تركيب تكييف اسبليت جديد في أوضة النوم وشحن فريون.',
    address: 'St. 10, Nasr City, Cairo',
    review: { rating: 5, comment: 'Installed the AC and fixed the cooling, very clean work.', commentAr: 'ركب التكييف وظبط التبريد، شغل نضيف جداً.', month: 10, day: 13 },
    invoice: { method: 'visa', status: 'paid', month: 10, day: 13 },
  },
  {
    tech: 8, date: '2026-11-02', status: 'completed',
    description: 'Fix a power trip in the kitchen circuit.',
    descriptionAr: 'حل مشكلة فصل الكهربا في دايرة المطبخ.',
    address: 'Corniche St., Luxor',
    review: { rating: 5, comment: 'Found the fault fast and explained everything.', commentAr: 'لقى العطل بسرعة وشرحلي كل حاجة.', month: 11, day: 3 },
    invoice: { method: 'vodafone-cash', status: 'paid', month: 11, day: 3 },
  },
  {
    tech: 0, date: '2026-11-18', status: 'completed',
    description: 'Fix a leak under the kitchen sink.',
    descriptionAr: 'إصلاح تسريب تحت حوض المطبخ.',
    address: 'Al Awameya, Luxor',
    invoice: { method: 'cash', status: 'pending_cash', month: 11, day: 18 },
  },
  {
    tech: 6, date: '2026-11-28', status: 'accepted',
    description: 'Deep cleaning for a 3-bedroom flat before moving in.',
    descriptionAr: 'تنظيف عميق لشقة ٣ أوض قبل السكن.',
    address: 'Al Mahatta St., Luxor',
  },
];

module.exports = { PROFESSIONS, CITY_COORDS, TECHNICIANS, DEMO_CLIENT, DEMO_TECH, ADMIN, SEED_BOOKINGS, SERVICE_FEE_EGP };
