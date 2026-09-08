/**
 * Two defects in english_verses.js, both inherited from the Spanish edition
 * and both surfaced by joining the Portuguese corpus against it:
 *
 *   Mormon|0        18 verses keyed to chapter 0 instead of chapter 1,
 *                   and Mormon 1:1 absent altogether
 *   Helaman|8|27    absent
 *
 * They are not Portuguese problems — they are live in the Spanish edition
 * right now, where Mórmon 1 renders with an empty English column in Dual.
 *
 * The missing verses are re-fetched from the Church API in English rather than
 * typed, and the chapter-0 block is remapped. Everything else is left alone.
 *
 * Usage: node tools/repair_english.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'english_verses.js');
const API = 'https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseVerses(body) {
  const out = [];
  const re = /<p class="verse"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(body))) {
    let h = m[1];
    const num = (h.match(/<span class="verse-number">\s*(\d+)/) || [])[1];
    h = h.replace(/<span class="verse-number">[\s\S]*?<\/span>/g, '');
    const text = h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                  .replace(/&#8217;/g, '’').replace(/\s+/g, ' ').trim();
    if (text && num) out.push({ verse: +num, text });
  }
  return out;
}

async function chapterEn(vol, slug, ch) {
  const uri = `/scriptures/${vol}/${slug}/${ch}`;
  const res = await fetch(`${API}?uri=${encodeURIComponent(uri)}&lang=eng`);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + uri);
  const d = await res.json();
  return parseVerses(d.content.body);
}

(async () => {
  const s = { window: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), s, { filename: 'english_verses.js' });
  const EN = s.window._englishVersesData;
  const before = Object.keys(EN).length;

  // 1. Mormon chapter 0 -> chapter 1
  let moved = 0;
  for (const k of Object.keys(EN)) {
    if (k.startsWith('Mormon|0|')) {
      EN['Mormon|1|' + k.split('|')[2]] = EN[k];
      delete EN[k];
      moved++;
    }
  }

  // 2. re-fetch the two chapters that lost a verse, and fill only what is missing
  let filled = 0;
  for (const [book, vol, slug, ch] of [['Mormon', 'bofm', 'morm', 1], ['Helaman', 'bofm', 'hel', 8]]) {
    const verses = await chapterEn(vol, slug, ch);
    for (const v of verses) {
      const key = `${book}|${ch}|${v.verse}`;
      if (!EN[key]) { EN[key] = v.text; filled++; console.log(`  filled ${key}`); }
    }
    await sleep(400);
  }

  const after = Object.keys(EN).length;
  fs.writeFileSync(FILE, 'window._englishVersesData = ' + JSON.stringify(EN) + ';\n');
  console.log(`\nMormon|0 -> Mormon|1 : ${moved} verses remapped`);
  console.log(`missing verses filled: ${filled}`);
  console.log(`total: ${before.toLocaleString()} -> ${after.toLocaleString()}`);
})();
