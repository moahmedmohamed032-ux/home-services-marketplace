// Seed data: professions and a realistic spread of technicians across Egypt,
// plus one demo client and one demo technician account.
const PROFESSIONS = [
  { id: 'plumber', name: 'Plumber', nameAr: 'سباك', icon: '🔧' },
  { id: 'electrician', name: 'Electrician', nameAr: 'كهربائي', icon: '⚡' },
  { id: 'painter', name: 'Painter', nameAr: 'نقاش', icon: '🎨' },
  { id: 'carpenter', name: 'Carpenter', nameAr: 'نجار', icon: '🪚' },
  { id: 'ac-technician', name: 'AC Technician', nameAr: 'فني تكييف', icon: '❄️' },
  { id: 'cleaner', name: 'Cleaner', nameAr: 'عامل نظافة', icon: '🧹' },
  { id: 'appliance-repair', name: 'Appliance Repair', nameAr: 'صيانة أجهزة', icon: '🛠️' },
  { id: 'tiler', name: 'Tiler', nameAr: 'بلاط', icon: '🧱' },
];

// Reference coordinates per city (center); technicians are jittered around it.
const CITY_COORDS = {
  Luxor: { lat: 25.6872, lng: 32.6396 },
  Cairo: { lat: 30.0444, lng: 31.2357 },
  Alexandria: { lat: 31.2001, lng: 29.9187 },
  Giza: { lat: 30.0131, lng: 31.2089 },
};

const TECHNICIANS = [
  { name: 'Mahmoud Abdelaziz', profession: 'plumber', city: 'Luxor', yearsExperience: 12, hourlyRate: 120, rating: 4.8, jobsDone: 340, bio: 'Specialist in bathroom and kitchen plumbing, leak detection and full repiping.' },
  { name: 'Ahmed Samy', profession: 'electrician', city: 'Luxor', yearsExperience: 9, hourlyRate: 150, rating: 4.9, jobsDone: 412, bio: 'Certified electrician: wiring, breaker panels, lighting design and smart-home setups.' },
  { name: 'Youssef Hassan', profession: 'painter', city: 'Cairo', yearsExperience: 15, hourlyRate: 100, rating: 4.7, jobsDone: 530, bio: 'Interior and exterior painting, decorative finishes and waterproof coatings.' },
  { name: 'Mohamed ElSayed', profession: 'carpenter', city: 'Cairo', yearsExperience: 18, hourlyRate: 140, rating: 4.9, jobsDone: 610, bio: 'Custom furniture, kitchens, doors and full woodwork restoration.' },
  { name: 'Karim Fathy', profession: 'ac-technician', city: 'Alexandria', yearsExperience: 8, hourlyRate: 160, rating: 4.6, jobsDone: 288, bio: 'Split and central AC installation, maintenance and gas refills for all brands.' },
  { name: 'Hassan Ali', profession: 'plumber', city: 'Cairo', yearsExperience: 7, hourlyRate: 110, rating: 4.5, jobsDone: 198, bio: 'Fast response for emergency leaks, water heater installs and drainage work.' },
  { name: 'Omar Nasser', profession: 'electrician', city: 'Alexandria', yearsExperience: 11, hourlyRate: 145, rating: 4.8, jobsDone: 356, bio: 'Industrial and residential electrical work, fault tracing and safety inspections.' },
  { name: 'Tarek Mostafa', profession: 'tiler', city: 'Giza', yearsExperience: 14, hourlyRate: 115, rating: 4.7, jobsDone: 402, bio: 'Ceramic, porcelain and marble tiling with precision leveling and finishing.' },
  { name: 'Salah Ibrahim', profession: 'appliance-repair', city: 'Luxor', yearsExperience: 10, hourlyRate: 130, rating: 4.6, jobsDone: 275, bio: 'Washers, fridges, ovens and dishwashers — genuine parts with 3-month warranty.' },
  { name: 'Amr Khaled', profession: 'painter', city: 'Luxor', yearsExperience: 6, hourlyRate: 90, rating: 4.4, jobsDone: 143, bio: 'Apartment and villa painting, quick turnaround and clean delivery.' },
  { name: 'Nadia Fouad', profession: 'cleaner', city: 'Cairo', yearsExperience: 5, hourlyRate: 70, rating: 4.9, jobsDone: 460, bio: 'Deep cleaning for homes and offices, post-renovation and move-in packages.' },
  { name: 'Mona Adel', profession: 'cleaner', city: 'Alexandria', yearsExperience: 7, hourlyRate: 75, rating: 4.8, jobsDone: 512, bio: 'Reliable weekly and one-off cleaning with eco-friendly products.' },
];

const DEMO_CLIENT = { name: 'Demo Client', email: 'client@demo.com', password: 'Demo@1234', role: 'client', city: 'Luxor' };
const DEMO_TECH = {
  name: 'Demo Technician', email: 'tech@demo.com', password: 'Demo@1234', role: 'technician',
  profession: 'electrician', city: 'Luxor', yearsExperience: 4, hourlyRate: 100,
  bio: 'Demo technician account — log in to see the technician dashboard.',
};

module.exports = { PROFESSIONS, TECHNICIANS, DEMO_CLIENT, DEMO_TECH, CITY_COORDS };
