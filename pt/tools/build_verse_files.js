/**
 * Portuguese verse files in the READER'S OWN FORMAT, so the existing engine
 * renders them with no changes:
 *
 *   (function(){ var v1 = [ {num:1, words:[["No",""],["princípio,",""]]} ];
 *                renderVerseSet(v1, 'gen-ch1-verses'); })();
 *
 * The gloss half is filled by tools/por_gloss.js, which is the whole toolchain
 * in one call: function words, names, the generated conjugation paradigm, the
 * alignment against the English column, and the bilingual dictionary — in that
 * order of authority. A token it cannot settle is left empty rather than
 * guessed; an empty gloss is visible and reviewable, a wrong one is not.
 *
 * Usage: node tools/build_verse_files.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORPUS = path.join(ROOT, 'corpus');
const OUT = path.join(ROOT, 'verses');
fs.mkdirSync(OUT, { recursive: true });

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const BOOKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'books_pt.json'), 'utf8'));
const { gloss, tokenise } = require('./por_gloss.js');
const files = fs.readdirSync(CORPUS).filter(f => f.endsWith('.json') && !f.startsWith('_'));
let books = 0, verses = 0, words = 0, glossed = 0, missing = 0;
const nonContiguous = [];

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  const meta = BOOKS.find(b => b.gridId === d.gridId);
  if (!meta) { console.error('  no book metadata for ' + d.gridId); continue; }
  const prefix = meta.prefix;
  const byChapter = new Map();
  for (const r of d.rows) {
    if (!byChapter.has(r.chapter)) byChapter.set(r.chapter, []);
    byChapter.get(r.chapter).push(r);
  }

  let out = '(function() {\n';
  const chapters = [...byChapter.keys()].sort((a, b) => a - b);
  for (const ch of chapters) {
    const rows = byChapter.get(ch).sort((a, b) => a.verse - b.verse);
    /* renderVerseSet keys the English column by POSITION (idx + 1), not by
       v.num — so a chapter whose verses are not 1..N in order would silently
       pair the wrong English. Report it rather than emit it quietly. */
    rows.forEach((r, i) => { if (r.verse !== i + 1) nonContiguous.push(`${d.bookEn} ${ch}: row ${i + 1} is verse ${r.verse}`); });

    out += `var v${ch} = [\n`;
    out += rows.map(r => {
      /* multiword units are ONE token: "e aconteceu que" / "and-it-came-to-pass-that" */
      const w = tokenise(r.text)
        .map(t => {
          const g = t.gloss || gloss(t.text);
          if (g) glossed += t.n; else missing += t.n;
          return `["${esc(t.text)}","${esc(g || '')}"]`;
        }).join(',');
      words += r.text.split(/\s+/).filter(Boolean).length;
      verses++;
      return `  {num:${r.verse},words:[${w}]}`;
    }).join(',\n');
    out += `\n];\n`;
  }
  for (const ch of chapters) {
    // the container the reader created: BOOK_DATA prefix + chapter + '-verses'
    out += `renderVerseSet(v${ch}, '${prefix}${ch}-verses');\n`;
  }
  out += '})();\n';
  fs.writeFileSync(path.join(OUT, f.replace('.json', '.js')), out);
  books++;
}

console.log(`books ${books}   verses ${verses.toLocaleString()}   words ${words.toLocaleString()}`);
console.log(`glossed ${glossed.toLocaleString()} of ${words.toLocaleString()} (${(100 * glossed / words).toFixed(2)}%)`);
if (nonContiguous.length) {
  console.log(`\nNON-CONTIGUOUS CHAPTERS (${nonContiguous.length}) — the English column would misalign:`);
  nonContiguous.slice(0, 12).forEach(x => console.log('  ' + x));
} else {
  console.log('every chapter numbers its verses 1..N in order — English keys will align');
}
