// Per-route HTML shells so crawlers that do not run JS still see the right title/description/canonical/og.
import fs from 'node:fs';
const SITE = 'https://fanni-marketplace.vercel.app';
const PAGES = [{
  path: '/dental/register',
  title: 'سجّل عيادة أسنان | FIX-IT',
  desc: 'دكتور أسنان في الأقصر أو إسنا أو قنا أو أرمنت؟ سجّل عيادتك مجانًا وهتظهر للمرضى بعد المراجعة.',
}];
const base = fs.readFileSync('dist/index.html', 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
for (const p of PAGES) {
  let h = base;
  const url = SITE + p.path;
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${p.title}</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(p.desc)}$2`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(p.title)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(p.desc)}$2`);
  h = h.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(p.title)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(p.desc)}$2`);
  fs.mkdirSync(`dist${p.path}`, { recursive: true });
  fs.writeFileSync(`dist${p.path}/index.html`, h);
}
