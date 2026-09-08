/**
 * Gloss the tail from the alignment evidence, with a confidence bar.
 *
 * tools/por_unglossed.tsv already carries, for every form with no gloss, the
 * English words that occur with it far more than chance. Where that evidence
 * is strong and unambiguous the gloss can be accepted; where it is not, the
 * form stays unglossed and goes to review. An empty gloss is visible and
 * fixable; a wrong one is neither.
 *
 * NO MARGIN TEST HERE, and that is deliberate. It is the right guard for the
 * name registry, where a narrow lead means two names that merely travel
 * together (Ômega/Alpha). For content words the top two candidates are usually
 * SYNONYMS — imundície has uncleanness 0.58 and filthiness 0.53, bode has goat
 * 0.55 and kid 0.53 — so a narrow margin is agreement, not ambiguity, and the
 * test rejected exactly the entries it should have accepted.
 *
 * The bars that remain:
 *   dice >= 0.30     the two really do travel together (measured: 0.30 keeps
 *                    assolação->desolation, trás->backward, feras->beasts;
 *                    tightening to 0.50 loses them and gains nothing)
 *   length >= 3      "p" aligned to "parley"; single letters are OCR and
 *                    verse-reference debris, never words
 *   the candidate is not itself a Portuguese form (proper nouns leak in)
 *
 * Writes tools/por_supplement.json: form -> english
 *        tools/por_supplement_review.tsv: everything that failed a bar
 *
 * Usage: node tools/build_supplement.js
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const rows = fs.readFileSync(path.join(HERE, 'por_unglossed.tsv'), 'utf8').split('\n').slice(1);
const M = JSON.parse(fs.readFileSync(path.join(HERE, 'por_morph.json'), 'utf8'));

/* THE SUPPLEMENT ACCUMULATES. report_unglossed.js runs against a glosser that
   already loads this file, so its output only ever lists what is STILL
   unglossed. Rewriting from scratch therefore discards everything the previous
   pass added — 4,538 entries lost in one run, and coverage went backwards. */
const OUT = path.join(HERE, 'por_supplement.json');
const accept = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const carried = Object.keys(accept).length;
const review = [], weak = [];
let seen = 0;
for (const line of rows) {
  if (!line.trim()) continue;
  const [form, count, cands, example] = line.split('\t');
  seen++;
  const parsed = (cands || '').split(', ').map(c => {
    const m = c.match(/^(.+) \(([\d.]+)\)$/);
    return m ? { en: m[1], d: parseFloat(m[2]) } : null;
  }).filter(Boolean);
  if (!parsed.length) { review.push([form, count, 'no candidate', example].join('\t')); continue; }
  const top = parsed[0];
  const margin = parsed[1] ? top.d / parsed[1].d : Infinity;
  /* a candidate that is itself a Portuguese form is alignment noise, not a
     translation — proper nouns and OCR fragments both land here */
  const selfish = !!M.forms[top.en];
  /* EVERY WORD GETS A GLOSS. The English column is the translation of these
     very verses, so even a weak association is evidence — and it is right far
     more often than not: perto->near at 0.25, tampouco->neither at 0.12,
     antiguidade->old at 0.15. Holding those back left real words blank while
     the evidence for them sat in the file. The confidence is recorded instead,
     so a low-scoring gloss is reviewable rather than invisible. */
  if (form.length >= 2 && !selfish) {
    accept[form] = top.en;
    if (top.d < 0.30) weak.push([form, count, top.en, top.d.toFixed(2), example].join('\t'));
  } else {
    review.push([form, count, `${top.en} d=${top.d.toFixed(2)}${selfish ? ' self' : ''}${form.length < 2 ? ' too-short' : ''}`, example].join('\t'));
  }
}

fs.writeFileSync(OUT, JSON.stringify(accept, null, 0));
fs.writeFileSync(path.join(HERE, 'por_supplement_review.tsv'),
  'form\tcount\twhy\texample\n' + review.join('\n'));

console.log('  carried in from earlier  :', carried.toLocaleString());
console.log('  unglossed forms examined :', seen.toLocaleString());
console.log('  total now                :', Object.keys(accept).length.toLocaleString());
console.log('  held for review          :', review.length.toLocaleString());
console.log('  accepted on weak evidence:', weak.length.toLocaleString(), '-> por_supplement_weak.tsv');
fs.writeFileSync(path.join(HERE, 'por_supplement_weak.tsv'),
  'form\tcount\tgloss\tdice\texample\n' + weak.join('\n'));
console.log();
for (const w of ['imundície', 'derramamento', 'bode', 'vacas', 'assolação', 'reinar', 'perto', 'trás', 'decurso'])
  console.log('    ' + w.padEnd(15) + '-> ' + (accept[w] || '(held)'));
