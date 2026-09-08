/**
 * The Portuguese Dual column: Portuguese verse beside its English.
 *
 * The English side already exists and is language-independent — the same
 * _englishVersesData the Spanish edition uses, keyed "Book|Chapter|Verse" by
 * ENGLISH book name. Every corpus row carries bookEn, so the join is direct
 * and needs no glossing at all. Dual is therefore buildable long before the
 * interlinear is.
 *
 * VERSIFICATION IS NOT ASSUMED TO MATCH. Almeida and the LDS English edition
 * agree almost everywhere, but not quite: Almeida splits 1 Samuel 20:42 into
 * 20:42 + 20:43, and chapter 21 then realigns. Divergences are REPORTED, never
 * silently dropped — a missing English column is a visible hole in the Dual
 * view, and a wrong one is worse.
 *
 * Usage: node tools/build_dual.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CORPUS = path.join(ROOT, 'corpus');
const OUT = path.join(ROOT, 'dual');
const ENGLISH = path.join(ROOT, 'english_verses.js');

function loadEnglish() {
  const s = { window: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(ENGLISH, 'utf8'), s, { filename: 'english_verses.js' });
  return s.window._englishVersesData;
}

const EN = loadEnglish();
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(CORPUS).filter(f => f.endsWith('.json') && !f.startsWith('_'));
let total = 0, matched = 0;
const gaps = [];

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  const rows = d.rows.map(r => {
    const key = r.bookEn + '|' + r.chapter + '|' + r.verse;
    const en = EN[key] || null;
    total++;
    if (en) matched++; else gaps.push(key);
    return { chapter: r.chapter, verse: r.verse, pt: r.text, en: en };
  });
  fs.writeFileSync(path.join(OUT, f), JSON.stringify({
    gridId: d.gridId, book: d.book, bookEn: d.bookEn, vol: d.vol,
    chapters: d.chapters, rows
  }, null, 0));
}

console.log(`books ${files.length}   verses ${total}   with English ${matched}` +
            `   (${(100 * matched / total).toFixed(2)}%)`);
if (gaps.length) {
  fs.writeFileSync(path.join(OUT, '_gaps.txt'), gaps.join('\n'));
  const byBook = {};
  gaps.forEach(k => { const b = k.split('|')[0]; byBook[b] = (byBook[b] || 0) + 1; });
  console.log(`\nverses with no English column (${gaps.length}) — written to dual/_gaps.txt`);
  Object.entries(byBook).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([b, n]) => console.log(`  ${b.padEnd(22)} ${n}`));
} else {
  console.log('\nevery Portuguese verse has an English counterpart');
}
