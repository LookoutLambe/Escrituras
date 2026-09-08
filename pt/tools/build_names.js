/**
 * The Portuguese name registry, derived from the ALIGNMENT rather than typed.
 *
 * The English side is already known (canon_names_en.json, 2,245 names) and the
 * Dual join gives every verse in both languages. So for each English name, the
 * Portuguese form is the capitalised token that co-occurs with it verse after
 * verse and hardly ever appears without it. Nephi/Néfi, Jacob/Jacó,
 * Moroni/Morôni fall out of the data; nothing is guessed from spelling.
 *
 * TWO GUARDS, because co-occurrence alone is not evidence:
 *   - association, not raw count. "Deus" co-occurs with every name in the book;
 *     what marks a pair is that the Portuguese token appears with THAT English
 *     name far more often than with anything else (Dice coefficient).
 *   - orthographic plausibility. Real cognate names stay recognisable across
 *     the two spellings; a high-scoring pair that shares almost no letters is
 *     reported for review instead of accepted.
 *
 * Writes tools/por_names.json:  form -> "English Name"
 *        tools/por_names_review.txt: pairs the guards rejected
 *
 * Usage: node tools/build_names.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DUAL = path.join(ROOT, 'dual');
const EN_NAMES = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'canon_names_en.json'), 'utf8')));
/* A COMMON NOUN IS NOT A NAME, even capitalised. Portuguese capitalises
   `Senhor` mid-sentence, and it duly aligned to Israel (they share s, e, r and
   occur in the same verses constantly) — so the registry glossed "the Lord" as
   "Israel". `sete` became Seth, `sem` became Shem, `jazer` became Jazer.
   The discriminator is not "is it in the dictionary" — Abraão, Moisés and
   Israel are all in there as proper nouns and must stay. It is whether the
   dictionary's gloss AGREES with the name being proposed. senhor->boss
   disagrees with Israel; abraão->Abraham agrees with Abraham. */
const DICT = fs.existsSync(path.join(__dirname, 'por_dict.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'por_dict.json'), 'utf8')) : {};
/* A CONJUGATED VERB IS NOT A NAME. `sabeis` (you know) was pairing to Laish —
   it is capitalised at the start of quoted speech often enough, and the two
   share letters. The conjugation tables settle it: if the paradigm generates
   the form, it is a verb. */
const CONJ = fs.existsSync(path.join(__dirname, 'por_conjug.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'por_conjug.json'), 'utf8')).forms : {};
function dictContradicts(pt, name) {
  const d = DICT[pt];
  if (!d || !d.length) return false;
  const n = name.toLowerCase();
  return !d.some(([en]) => en.toLowerCase() === n || en.toLowerCase().includes(n));
}

const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = t => /^[A-ZÀ-Þ]/.test(t);
const words = s => s.split(/[^0-9A-Za-zÀ-ÿ'-]+/).filter(Boolean);

/** letters in common, order-insensitive — cognate names survive respelling */
function similar(a, b) {
  a = strip(a); b = strip(b);
  const bag = {}; for (const c of a) bag[c] = (bag[c] || 0) + 1;
  let hit = 0; for (const c of b) if (bag[c] > 0) { bag[c]--; hit++; }
  return (2 * hit) / (a.length + b.length);
}

const ptCount = {}, enCount = {}, pair = {};
let verses = 0;

for (const f of fs.readdirSync(DUAL).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(fs.readFileSync(path.join(DUAL, f), 'utf8'));
  for (const r of d.rows) {
    if (!r.en) continue;
    verses++;
    const pts = new Set(words(r.pt).filter((t, i) => cap(t) && i > 0).map(t => t.toLowerCase()));
    /* POSSESSIVES ARE NOT SEPARATE NAMES. The canon list carries "jonathan's"
       and "manasseh's"; left as themselves they win on spelling against the
       base form and the registry ends up full of genitives. */
    const ens = new Set(words(r.en).filter(t => cap(t)).map(t => t.toLowerCase())
      .filter(t => EN_NAMES.has(t)).map(t => t.replace(/['’]s$/, '')));
    for (const p of pts) ptCount[p] = (ptCount[p] || 0) + 1;
    for (const e of ens) enCount[e] = (enCount[e] || 0) + 1;
    for (const p of pts) for (const e of ens) {
      (pair[p] = pair[p] || {})[e] = (pair[p][e] || 0) + 1;
    }
  }
}

const names = {}, review = [];
for (const p of Object.keys(pair)) {
  if (ptCount[p] < 3) continue;
  /* SIMILARITY CHOOSES AMONG THE CANDIDATES; ASSOCIATION ONLY ADMITS THEM.
     Picking the most-associated name and then vetoing on spelling gets the
     order wrong, because names that always occur TOGETHER score dice=1.00 on
     each other: Ômega paired to Alpha, Sadraque to Meshach, Noa to Mahlah,
     Zurisadai to Shelumiel — every one of them a list-mate, not a translation.
     Ranking the admitted candidates by spelling instead picks Omega, Shadrach,
     Noah and Zurishaddai, which is what the alignment actually says. */
  const cands = Object.entries(pair[p])
    .map(([e, n]) => ({ e, dice: (2 * n) / (ptCount[p] + enCount[e]), sim: similar(p, e) }))
    /* ADMIT LIBERALLY, ACCEPT STRICTLY. A 0.15 floor here threw away the right
       answer whenever a rare Portuguese name met a common English one: Noa
       (4 verses) against Noah (the patriarch, many more) scores dice 0.148 and
       was filtered out before similarity could choose, leaving it paired to
       Hoglah, its list-mate. Similarity does the choosing, so admission only
       has to keep the field sane. */
    .filter(c => c.dice >= 0.05)
    /* BOTH SIGNALS, NOT SPELLING ALONE. Ranking purely on similarity picked the
       KJV variant over the common form every time it existed — Noé to "Noe"
       (identical letters) rather than "Noah", Josias to "Josias", Aser to
       "Aser". Weighting the spelling by how strongly the two actually travel
       together puts the common form back in front, and leaves genuinely
       ambiguous cases (Noa, four verses, always beside Hoglah) for review. */
    .sort((a, b) => (b.sim * Math.sqrt(b.dice)) - (a.sim * Math.sqrt(a.dice)));
  if (!cands.length) continue;
  const top = cands[0];
  const proper = top.e.replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  if (CONJ[p]) { review.push(`${p}\t${proper}\tdice=${top.dice.toFixed(2)} sim=${top.sim.toFixed(2)} pt=${ptCount[p]}\tis-a-verb-form`); continue; }
  if (top.sim >= 0.50 && top.dice >= 0.10 && !dictContradicts(p, proper)) names[p] = proper;
  else if (dictContradicts(p, proper))
    review.push(`${p}\t${proper}\tdice=${top.dice.toFixed(2)} sim=${top.sim.toFixed(2)} pt=${ptCount[p]}\tdict-says-otherwise`);
  else review.push(`${p}\t${proper}\tdice=${top.dice.toFixed(2)} sim=${top.sim.toFixed(2)} pt=${ptCount[p]}`);
}

/* Names the alignment cannot reach: they appear only in headings and
   introductions, where there is no English verse beside them to align to. */
const EXTRA = { 'smith': 'Smith', 'joseph': 'Joseph', 'oliver': 'Oliver',
                'cowdery': 'Cowdery', 'hyrum': 'Hyrum', 'sidney': 'Sidney',
                'rigdon': 'Rigdon', 'brigham': 'Brigham', 'young': 'Young' };
for (const [k, v] of Object.entries(EXTRA)) if (!names[k]) names[k] = v;

fs.writeFileSync(path.join(__dirname, 'por_names.json'), JSON.stringify(names, null, 0));
fs.writeFileSync(path.join(__dirname, 'por_names_review.txt'), review.join('\n'));

console.log('  verse pairs read :', verses.toLocaleString());
console.log('  names accepted   :', Object.keys(names).length.toLocaleString());
console.log('  held for review  :', review.length.toLocaleString(), '-> tools/por_names_review.txt');
const show = ['néfi', 'jacó', 'morôni', 'davi', 'judá', 'sião', 'aarão', 'moisés', 'abraão', 'isaías', 'jesus', 'mórmon'];
console.log('\n  ' + show.map(n => n.padEnd(9) + '-> ' + (names[n] || '(not found)')).join('\n  '));
