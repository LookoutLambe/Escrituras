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
/* Forms the grammar calls ambiguous are decided by the verse's own English —
   see por_context.js. seu/sua/seus/suas agree with the thing possessed, not
   the possessor, so "suas sinagogas" is their synagogues or his synagogues
   depending on the subject, and only the context can say which. */
const { contextual } = require('./por_context.js');
/* Deus -> God, not god: a capitalised source word keeps its capital, the same
   rule por_gloss applies to its own output. */
const cap = (raw, g) => (/^[^0-9A-Za-zÀ-ÿ]*[A-ZÀ-Þ]/.test(raw) && /^[a-z]/.test(g)
  ? g[0].toUpperCase() + g.slice(1) : g);
const DUAL = path.join(ROOT, 'dual');
const files = fs.readdirSync(CORPUS).filter(f => f.endsWith('.json') && !f.startsWith('_'));
let books = 0, verses = 0, words = 0, glossed = 0, missing = 0;
const nonContiguous = [];

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
  /* the English of each verse, for the ambiguous forms */
  const dualFile = path.join(DUAL, f);
  const EN = {};
  if (fs.existsSync(dualFile)) {
    for (const r of JSON.parse(fs.readFileSync(dualFile, 'utf8')).rows)
      if (r.en) EN[r.chapter + ':' + r.verse] = r.en;
  }
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
      const en = EN[r.chapter + ':' + r.verse] || '';
      const toks = tokenise(r.text);
      const bares = toks.map(t => t.text.replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ]+$/g, '').toLowerCase());
      const w = toks
        .map((t, ti) => {
          const bare = bares[ti];
          /* `a` and `se` are decided by what FOLLOWS them, so the contextual
             pass needs the rest of the verse, not just this token. */
          const ctx = contextual(bare, {
            after: bares.slice(ti + 1), before: bares.slice(0, ti), en,
            raw: t.text.replace(/^[^0-9A-Za-zÀ-ÿ]+/, ''),
            prevRaw: ti ? toks[ti - 1].text : '',
          });
          const g = t.gloss || (ctx ? t.text.replace(/[0-9A-Za-zÀ-ÿ]+/, cap(t.text, ctx)) : gloss(t.text, en, {
            initial: ti === 0 || /[.;:!?—]$/.test(ti ? toks[ti - 1].text : ''),
            /* a clause head, which is wider: a coordinator also opens one */
            clauseStart: ti === 0 || /[.;:!?—,]$/.test(ti ? toks[ti - 1].text : '') ||
                         /^(e|mas|ou|portanto|pois|sim)$/.test(bares[ti - 1] || ''),
          }));
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
