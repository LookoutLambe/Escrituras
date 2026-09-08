/**
 * Gloss candidates from the ALIGNMENT — the strongest source available.
 *
 * A general bilingual dictionary is written for modern prose and misses the
 * vocabulary this text is made of: FreeDict has no mandamento, no iniquidade,
 * no salvação, no convênio. But the corpus is 41,994 verses in Portuguese
 * beside the SAME verses in English, so the translation of every word that
 * matters is already sitting there. iniquidade -> iniquity is not a guess; it
 * is what the English column says, verse after verse.
 *
 * Method is the name registry's, widened to content words: Dice association
 * over verse co-occurrence. Two guards, because co-occurrence alone is not
 * evidence — the same lesson as Ômega/Alpha:
 *
 *   - a candidate must beat its rivals by a margin, not merely lead. Words
 *     that travel together in scripture ("faith"/"hope", "sword"/"shield")
 *     otherwise gloss each other.
 *   - stopwords on both sides are excluded outright. "the" co-occurs with
 *     everything and would win on raw counts everywhere.
 *
 * Writes tools/por_aligned.json:  pt form -> [[english, dice, n], ...]
 *
 * Usage: node tools/build_aligned_gloss.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DUAL = path.join(ROOT, 'dual');

const PT_STOP = new Set(('de a o e que do da em um para com não uma os no se na por mais as dos como mas ao ele das à seu sua ou quando muito nos já eu também só pelo pela até isso ela entre depois sem mesmo aos seus quem nas me esse eles você essa num nem suas meu às minha numa pelos elas qual nós lhe deles essas esses pelas este dele tu te vos vós lhes meus minhas teu tua teus tuas nosso nossa nossos nossas dela delas esta estes estas aquele aquela aqueles aquelas isto aquilo').split(' '));
/* PREPOSITIONS ARE NOT STOPWORDS HERE. An interlinear glosses `diante` as
   "before" and `lá` as "there"; stoplisting those English words on the
   grounds that they are frequent left diante (1,375 tokens), lá and perto
   with no gloss at all. Only articles, auxiliaries, pronouns and the pure
   connectives are excluded — the words that co-occur with everything and
   would win on counts alone. */
const EN_STOP = new Set(('the of and to in that a is was are were be been it they them him her she his my me you your our we their but or not for with by from as all which who what when shall will may can would should could have has had did do doth hath thee thy ye this these those there-is also so then').split(' '));

const ptC = {}, enC = {}, pair = {};
let verses = 0;
const words = (s, lower = true) => (lower ? s.toLowerCase() : s)
  .split(/[^0-9A-Za-zÀ-ÿ'-]+/).filter(Boolean);

for (const f of fs.readdirSync(DUAL).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(fs.readFileSync(path.join(DUAL, f), 'utf8'));
  for (const r of d.rows) {
    if (!r.en) continue;
    verses++;
    /* length > 2 dropped `lá` (there), `ó` (O), `há` (there-is) — short is not
       the same as functional, and the stoplists already carry the function
       words. Two characters is the floor on the Portuguese side. */
    const P = new Set(words(r.pt).filter(w => w.length >= 2 && !PT_STOP.has(w)));
    const E = new Set(words(r.en).filter(w => w.length >= 2 && !EN_STOP.has(w)));
    for (const p of P) ptC[p] = (ptC[p] || 0) + 1;
    for (const e of E) enC[e] = (enC[e] || 0) + 1;
    for (const p of P) { const m = pair[p] = pair[p] || {}; for (const e of E) m[e] = (m[e] || 0) + 1; }
  }
}

const out = {};
let solid = 0;
for (const p of Object.keys(pair)) {
  if (ptC[p] < 4) continue;
  const cands = Object.entries(pair[p])
    .map(([e, n]) => ({ e, n, dice: (2 * n) / (ptC[p] + enC[e]) }))
    .sort((a, b) => b.dice - a.dice)
    .slice(0, 4);
  if (!cands.length || cands[0].dice < 0.12) continue;
  /* a clear winner, not a photo finish: scripture puts faith beside hope and
     sword beside shield often enough that a narrow lead means nothing */
  const margin = cands.length > 1 ? cands[0].dice / cands[1].dice : Infinity;
  if (margin < 1.25) continue;
  out[p] = cands.map(c => [c.e, +c.dice.toFixed(3), c.n]);
  if (cands[0].dice >= 0.35) solid++;
}

fs.writeFileSync(path.join(__dirname, 'por_aligned.json'), JSON.stringify(out, null, 0));
console.log('  verse pairs        :', verses.toLocaleString());
console.log('  forms with a gloss :', Object.keys(out).length.toLocaleString());
console.log('  strong (dice>=0.35):', solid.toLocaleString());
console.log();
for (const w of ['iniquidade', 'mandamentos', 'lamanitas', 'nefitas', 'salvação', 'convênio',
                 'congregação', 'arrependimento', 'batismo', 'sacerdócio', 'tabernáculo', 'redentor'])
  console.log('    ' + w.padEnd(16) + '-> ' + ((out[w] || []).slice(0, 3).map(c => c[0] + ' (' + c[1] + ')').join(', ') || '(none)'));
