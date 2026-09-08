/**
 * Portuguese book names, read from the Church's own content API rather than
 * typed out. Every chapter response carries a title like "1 Néfi 1"; the book
 * name is that title minus its trailing number. Doing it this way also
 * validates all 87 slugs in one pass — a wrong slug shows up as a miss here
 * instead of as a silent gap 1,582 chapters into the real fetch.
 */
const fs = require('fs');
const path = require('path');
const API = 'https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content';
const DELAY = 350;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function titleOf(vol, slug, lang) {
  const uri = `/scriptures/${vol}/${slug}/1`;
  const res = await fetch(`${API}?uri=${encodeURIComponent(uri)}&lang=${lang}`);
  if (!res.ok) return { err: 'HTTP ' + res.status };
  const d = await res.json();
  /* The title is at meta.title. content.head.title looks like the obvious
     place and is always empty — a first pass read it there and every one of
     the 87 books came back null. */
  const t = (d.meta && d.meta.title) || '';
  return { title: t };
}

(async () => {
  const books = JSON.parse(fs.readFileSync(path.join(__dirname, 'books_skeleton.json'), 'utf8'));
  const out = [], misses = [];
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    const r = await titleOf(b.vol, b.slug, 'por');
    if (r.err || !r.title) { misses.push({ ...b, why: r.err || 'no title' }); out.push({ ...b, namePor: null }); }
    else {
      // "1 Néfi 1" -> "1 Néfi";  "Doutrina e Convênios 1" -> "Doutrina e Convênios"
      const namePor = r.title.replace(/\s+\d+\s*$/, '').trim();
      out.push({ ...b, namePor });
    }
    if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${books.length}`);
    await sleep(DELAY);
  }
  fs.writeFileSync(path.join(__dirname, 'books_pt.json'), JSON.stringify(out, null, 1));
  console.log('books:', out.length, ' named:', out.filter(b => b.namePor).length, ' misses:', misses.length);
  if (misses.length) console.log('MISSES:', JSON.stringify(misses, null, 1));
  console.log('\nsample:');
  ['ot','nt','bofm','dc-testament','pgp'].forEach(v => {
    out.filter(b => b.vol === v).slice(0, 4).forEach(b => console.log(`  ${v.padEnd(13)} ${b.nameEn.padEnd(22)} -> ${b.namePor}`));
  });
})();
