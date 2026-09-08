/**
 * Multiword units — the phrases this interlinear must treat as one token.
 *
 * Some Portuguese phrases are one English word and splitting them either
 * doubles a word or loses one. "não obstante" is "nevertheless", not "no" +
 * "nevertheless". "por causa de" is "because-of". And the formula the Book of
 * Mormon runs on — "e aconteceu que" — is "and it came to pass that", which
 * word-by-word becomes four unrelated glosses.
 *
 * The Spanish edition read its inventory off a corpus that was already
 * hand-tokenised. This one is machine-split, so the units are derived from the
 * ALIGNMENT instead: an n-gram is a unit when it binds to an English word far
 * more tightly than either of its parts does on its own. That is the same
 * evidence, measured rather than inherited.
 *
 * Seeded with the conjunctive locutions the reference grammars list, because
 * those are grammar, not statistics — a fixed locution is a unit whether or
 * not this corpus happens to use it often.
 *
 * Writes tools/por_units.json: "portuguese phrase" -> gloss
 *
 * Usage: node tools/build_units.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DUAL = path.join(ROOT, 'dual');
const MIN_COUNT = 6;
const NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_names.json'), 'utf8'));
const MIN_DICE = 0.30;
const MIN_GAIN = 1.30;          // the unit must beat its best single part

/* Fixed locutions from the grammars. Gloss written as one hyphenated token. */
const SEED = {
  /* conjunctive locutions */
  'ainda que': 'although', 'posto que': 'although', 'se bem que': 'although',
  'visto que': 'seeing-that', 'já que': 'since', 'uma vez que': 'since',
  'logo que': 'as-soon-as', 'assim que': 'as-soon-as', 'antes que': 'before',
  'depois que': 'after', 'até que': 'until', 'para que': 'that',
  'a fim de que': 'so-that', 'de modo que': 'so-that', 'de maneira que': 'so-that',
  'de sorte que': 'so-that', 'de forma que': 'so-that', 'contanto que': 'provided-that',
  'a menos que': 'unless', 'salvo se': 'unless', 'caso que': 'in-case',
  'por conseguinte': 'therefore', 'por isso': 'therefore', 'por tanto': 'therefore',
  'no entanto': 'however', 'entretanto': 'however', 'todavia': 'nevertheless',
  'não obstante': 'nevertheless', 'contudo': 'yet', 'ao passo que': 'whereas',
  'ou seja': 'that-is', 'isto é': 'that-is', 'quer dizer': 'that-is',
  /* prepositional locutions */
  'por causa de': 'because-of', 'a fim de': 'in-order-to', 'em vez de': 'instead-of',
  'ao invés de': 'instead-of', 'ao redor de': 'around', 'em redor de': 'round-about',
  'em torno de': 'around', 'defronte de': 'over-against', 'diante de': 'before',
  'perante': 'before', 'acerca de': 'concerning', 'a respeito de': 'concerning',
  'por meio de': 'by-means-of', 'através de': 'through', 'apesar de': 'despite',
  'além de': 'besides', 'aquém de': 'short-of', 'dentro de': 'within',
  'fora de': 'outside', 'junto de': 'beside', 'em frente de': 'in-front-of',
  'por baixo de': 'beneath', 'por cima de': 'above', 'em cima de': 'upon',
  'debaixo de': 'under', 'ao lado de': 'beside', 'em lugar de': 'in-place-of',
  'a par de': 'alongside', 'de acordo com': 'according-to', 'conforme a': 'according-to',
  /* adverbial locutions */
  'de novo': 'again', 'de certo': 'truly', 'em verdade': 'verily',
  'de fato': 'indeed', 'com efeito': 'indeed', 'em vão': 'in-vain',
  'de repente': 'suddenly', 'de pressa': 'quickly', 'aos poucos': 'little-by-little',
  'por diante': 'onward', 'para sempre': 'for-ever', 'para todo o sempre': 'for-ever-and-ever',
  'de todo': 'wholly', 'em breve': 'shortly', 'por ora': 'for-now',
  'ao acaso': 'at-random', 'de propósito': 'on-purpose', 'às vezes': 'sometimes',
  'de longe': 'from-afar', 'ao longe': 'afar-off', 'em redor': 'round-about',
  /* the narrative formulae this book runs on */
  'aconteceu que': 'it-came-to-pass-that', 'e aconteceu que': 'and-it-came-to-pass-that',
  'sucedeu que': 'it-came-to-pass-that', 'e sucedeu que': 'and-it-came-to-pass-that',
  'eis que': 'behold', 'e eis que': 'and-behold', 'porquanto': 'because',
  'ora bem': 'now-then', 'assim diz': 'thus-saith', 'assim disse': 'thus-said',
};

const EN_STOP = new Set(('the of and to in that a is was are were be been it they them him her she his my me you your our we their but or not for with by from as all which who what when shall will may can would should could have has had did do doth hath thee thy ye this these those there also so then').split(' '));
const words = s => s.split(/[^0-9A-Za-zÀ-ÿ'-]+/).filter(Boolean);
const PT_FUNC = new Set(('de a o e que do da em um para com não uma os no se na por mais as dos como mas ao ele das à seu sua ou quando muito nos já eu também só pelo pela até isso ela entre depois sem mesmo aos seus quem nas me esse eles essa num nem suas meu às minha numa pelos elas qual nós lhe deles').split(' '));

const ngC = {}, enC = {}, pair = {}, uni = {};
for (const f of fs.readdirSync(DUAL).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(fs.readFileSync(path.join(DUAL, f), 'utf8'));
  for (const r of d.rows) {
    if (!r.en) continue;
    const P = words(r.pt).map(w => w.toLowerCase());
    const E = new Set(words(r.en).map(w => w.toLowerCase()).filter(w => w.length > 2 && !EN_STOP.has(w)));
    for (const e of E) enC[e] = (enC[e] || 0) + 1;
    const seen = new Set();
    for (const w of P) if (!seen.has(w)) {
      seen.add(w); uni[w] = (uni[w] || 0) + 1;
      const m = pair[w] = pair[w] || {};          // unigrams need co-occurrence too,
      for (const e of E) m[e] = (m[e] || 0) + 1;  // or there is nothing to compare against
    }
    for (let n = 2; n <= 3; n++) {
      const s2 = new Set();
      for (let i = 0; i + n <= P.length; i++) {
        const g = P.slice(i, i + n).join(' ');
        if (s2.has(g)) continue;
        s2.add(g);
        ngC[g] = (ngC[g] || 0) + 1;
        const m = pair[g] = pair[g] || {};
        for (const e of E) m[e] = (m[e] || 0) + 1;
      }
    }
  }
}

/* an n-gram's association with an English word, and its parts' best */
function dice(g, e) { return (2 * (pair[g][e] || 0)) / (ngC[g] + enC[e]); }
const units = Object.assign({}, SEED);
let learned = 0;
for (const g of Object.keys(ngC)) {
  if (ngC[g] < MIN_COUNT) continue;
  const best = Object.keys(pair[g]).reduce((a, e) => dice(g, e) > dice(g, a) ? e : a, Object.keys(pair[g])[0]);
  if (!best) continue;
  const d = dice(g, best);
  if (d < MIN_DICE) continue;
  /* THE PARTS, MEASURED THE SAME WAY. A phrase is only a unit if the whole
     binds to the English word better than any of its words does alone —
     otherwise every common bigram containing a strong word qualifies, which
     is how a first pass "learned" 6,360 of them. */
  const partBest = Math.max(...g.split(' ').map(w =>
    (2 * ((pair[w] && pair[w][best]) || 0)) / ((uni[w] || 1) + enC[best])));
  if (!(d / partBest >= MIN_GAIN)) continue;
  /* and a unit made only of function words is a coincidence, not a locution */
  if (g.split(' ').every(w => PT_FUNC.has(w))) continue;
  /* STATISTICS CONFIRM LOCUTIONS, THEY DO NOT FIND THEM. Left to itself this
     "learned" 3,427 units — cão e -> japheth, acamparam no -> rephidim — rare
     n-grams meeting rare English words, where both being rare inflates the
     score. A locution is frequent, contains a function word, and glosses to
     something that is not a proper noun. With those three the pass adds only
     what the grammar list missed. */
  if (ngC[g] < 30) continue;
  if (!g.split(' ').some(w => PT_FUNC.has(w))) continue;
  if (NAMES[best]) continue;
  /* A LOCUTION GLOSSES TO A COMMON WORD. The survivors of the earlier guards
     were formula fragments — "reis de israel" -> chronicles, "terra do" ->
     egypt, "capitão da guarda" -> nebuzar-adan — each a rare phrase meeting a
     rare noun inside one repeated sentence. Grammatical units render as
     except, instead, since, forever, caused: words the English column uses
     everywhere. */
  if (enC[best] < 200) continue;
  if (!units[g]) { units[g] = best; learned++; }
}

fs.writeFileSync(path.join(__dirname, 'por_units.json'), JSON.stringify(units, null, 0));
console.log('  seeded from the grammars :', Object.keys(SEED).length);
console.log('  learned from alignment   :', learned.toLocaleString());
console.log('  total units              :', Object.keys(units).length.toLocaleString());
const shown = ['e aconteceu que', 'aconteceu que', 'não obstante', 'eis que', 'por causa de', 'a fim de'];
console.log();
shown.forEach(u => console.log('    ' + u.padEnd(20) + '-> ' + (units[u] || '(absent)')));
