/**
 * What the unglossed words ARE, read off the English column.
 *
 * A list of 6,757 forms with no gloss is not actionable. But every one of them
 * sits in verses whose English is right there, so each can be presented with
 * (a) the English words that occur with it far more than chance, and (b) a
 * verse where it appears, in both languages. That is enough to read the
 * meaning off in most cases without any dictionary at all.
 *
 * Thresholds are deliberately LOWER than the glosser's. This file is for
 * review, not for shipping: a candidate too weak to gloss automatically is
 * still worth showing to a person.
 *
 * Writes tools/por_unglossed.tsv — form, count, candidates, example verse
 *
 * Usage: node tools/report_unglossed.js [howmany]
 */
const fs = require('fs');
const path = require('path');
const { gloss } = require('./por_gloss.js');

const ROOT = path.join(__dirname, '..');
const DUAL = path.join(ROOT, 'dual');
const LIMIT = parseInt(process.argv[2] || '0', 10);

const EN_STOP = new Set(('the of and to in that a is was are were be been it they them him her she his my me you your our we their but or not for with by from as all which who what when shall will may can would should could have has had did do doth hath thee thy ye this these those there also so then unto upon into out').split(' '));

const bare = t => t.replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ]+$/g, '').toLowerCase();
const words = s => s.split(/[^0-9A-Za-zÀ-ÿ'-]+/).filter(Boolean);

/* pass 1: which forms have no gloss, and where do they occur */
const need = {}, example = {};
const books = fs.readdirSync(DUAL).filter(f => f.endsWith('.json') && !f.startsWith('_'));
const rows = [];
for (const f of books) {
  const d = JSON.parse(fs.readFileSync(path.join(DUAL, f), 'utf8'));
  for (const r of d.rows) {
    rows.push({ book: d.book, ch: r.chapter, v: r.verse, pt: r.pt, en: r.en });
    for (const t of r.pt.split(/\s+/).filter(Boolean)) {
      if (gloss(t)) continue;
      const k = bare(t);
      if (!k) continue;
      need[k] = (need[k] || 0) + 1;
      if (!example[k] && r.en) example[k] = rows.length - 1;
    }
  }
}

/* pass 2: English association for exactly those forms */
const enC = {}, pair = {}, ptC = {};
for (const r of rows) {
  if (!r.en) continue;
  const P = new Set(words(r.pt).map(w => w.toLowerCase()).filter(w => need[w]));
  const E = new Set(words(r.en).map(w => w.toLowerCase()).filter(w => w.length > 2 && !EN_STOP.has(w)));
  for (const e of E) enC[e] = (enC[e] || 0) + 1;
  for (const p of P) {
    ptC[p] = (ptC[p] || 0) + 1;
    const m = pair[p] = pair[p] || {};
    for (const e of E) m[e] = (m[e] || 0) + 1;
  }
}

const ord = Object.entries(need).sort((a, b) => b[1] - a[1]);
const out = ['form\tcount\tenglish candidates\texample'];
for (const [w, n] of (LIMIT ? ord.slice(0, LIMIT) : ord)) {
  const cands = Object.entries(pair[w] || {})
    .map(([e, c]) => [e, (2 * c) / ((ptC[w] || 1) + enC[e])])
    .sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([e, d]) => e + ' (' + d.toFixed(2) + ')');
  const ex = example[w] !== undefined ? rows[example[w]] : null;
  out.push([w, n, cands.join(', ') || '—',
    ex ? `${ex.book} ${ex.ch}:${ex.v} — ${ex.en.slice(0, 150)}` : ''].join('\t'));
}
fs.writeFileSync(path.join(__dirname, 'por_unglossed.tsv'), out.join('\n'));
console.log('  unglossed forms   :', ord.length.toLocaleString());
console.log('  with a candidate  :', ord.filter(([w]) => pair[w] && Object.keys(pair[w]).length).length.toLocaleString());
console.log('  written to tools/por_unglossed.tsv');
console.log();
for (const [w, n] of ord.slice(0, 12)) {
  const c = Object.entries(pair[w] || {}).map(([e, x]) => [e, (2 * x) / ((ptC[w] || 1) + enC[e])])
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, d]) => e + ' ' + d.toFixed(2)).join(', ');
  console.log('  ' + w.padEnd(15) + String(n).padStart(4) + '   ' + (c || '—'));
}
