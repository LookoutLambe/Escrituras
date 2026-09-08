/**
 * The second-person paradigm — the one thing the treebanks cannot supply.
 *
 * UD Portuguese (Bosque + GSD, 546,493 tokens) contains NINE Person=2 pronoun
 * tokens and the form `tu` exactly zero times; this corpus has 1,637 `tu`,
 * 2,348 `vós`, 3,897 `te`. The modern treebanks are `você` (136 there, 0 here).
 * So the paradigm is derived from the corpus itself — which is the register —
 * and every verb form is CHECKED by reconstructing its infinitive and looking
 * that up. A candidate whose infinitive is not attested is not accepted; it is
 * reported. Endings alone would happily "find" second persons in nouns.
 *
 * Writes tools/por_second_person.json:
 *   pronouns  form -> {person, number, role, gloss}
 *   verbs     form -> {lemma, person, number, tense}
 *
 * Usage: node tools/build_second_person.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_morph.json'), 'utf8'));
const LEM = {};
for (const line of fs.readFileSync(path.join(__dirname, 'src', 'lemmatization-pt.txt'), 'utf8').split(/\r?\n/)) {
  const [l, f] = line.split('\t');
  if (f && l) LEM[f.trim().toLowerCase()] = l.trim().toLowerCase();
}
/** an infinitive the lexicon knows */
const isVerb = inf => !!(LEM[inf] || (M.forms[inf] || []).some(a => a[1] === 'VERB' || a[1] === 'AUX'));

/* The closed paradigm. Singular is tu, plural vós — the archaic/liturgical
   set the corpus is written in, not the modern você/vocês. */
const PRONOUNS = {
  'tu':       { person: 2, number: 'sing', role: 'subject',    gloss: 'thou' },
  'te':       { person: 2, number: 'sing', role: 'object',     gloss: 'thee' },
  'ti':       { person: 2, number: 'sing', role: 'prepositional', gloss: 'thee' },
  'contigo':  { person: 2, number: 'sing', role: 'comitative', gloss: 'with-thee' },
  'teu':      { person: 2, number: 'sing', role: 'possessive', gloss: 'thy' },
  'tua':      { person: 2, number: 'sing', role: 'possessive', gloss: 'thy' },
  'teus':     { person: 2, number: 'sing', role: 'possessive', gloss: 'thy' },
  'tuas':     { person: 2, number: 'sing', role: 'possessive', gloss: 'thy' },
  'vós':      { person: 2, number: 'plur', role: 'subject',    gloss: 'ye' },
  'vos':      { person: 2, number: 'plur', role: 'object',     gloss: 'you' },
  'convosco': { person: 2, number: 'plur', role: 'comitative', gloss: 'with-you' },
  'vosso':    { person: 2, number: 'plur', role: 'possessive', gloss: 'your' },
  'vossa':    { person: 2, number: 'plur', role: 'possessive', gloss: 'your' },
  'vossos':   { person: 2, number: 'plur', role: 'possessive', gloss: 'your' },
  'vossas':   { person: 2, number: 'plur', role: 'possessive', gloss: 'your' },
};

/* ending -> [how to rebuild the infinitive, person/number/tense] */
const ENDINGS = [
  ['aste',  'ar',  'sing', 'preterite'], ['este',  'er',  'sing', 'preterite'],
  ['iste',  'ir',  'sing', 'preterite'],
  ['astes', 'ar',  'plur', 'preterite'], ['estes', 'er',  'plur', 'preterite'],
  ['istes', 'ir',  'plur', 'preterite'],
  ['arás',  'ar',  'sing', 'future'],    ['erás',  'er',  'sing', 'future'],
  ['irás',  'ir',  'sing', 'future'],
  ['areis', 'ar',  'plur', 'future'],    ['ereis', 'er',  'plur', 'future'],
  ['ireis', 'ir',  'plur', 'future'],
  ['ais',   'ar',  'plur', 'present'],   ['eis',   'er',  'plur', 'present'],
  ['is',    'ir',  'plur', 'present'],
  ['avas',  'ar',  'sing', 'imperfect'], ['ias',   'er',  'sing', 'imperfect'],
  ['áveis', 'ar',  'plur', 'imperfect'], ['íeis',  'er',  'plur', 'imperfect'],
  ['as',    'ar',  'sing', 'present'],   ['es',    'er',  'sing', 'present'],
];

const freq = {};
for (const f of fs.readdirSync(path.join(ROOT, 'corpus')).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpus', f), 'utf8'));
  for (const r of d.rows)
    for (const t of r.text.toLowerCase().split(/[^0-9a-zà-ÿÀ-ſ-]+/)) if (t) freq[t] = (freq[t] || 0) + 1;
}

/* THE RECONSTRUCTED INFINITIVE PROVES NOTHING ABOUT THIS FORM. A first pass
   accepted any form whose stem + -ar/-er/-ir happened to be a real verb, and
   promptly declared `das` (the contraction de+as, 2,170), `dias` (days, 1,323),
   `casas` (houses), `portas` (doors), `animais` (animals) and `estas` (these)
   to be second-person verbs — because dar, casar, portar and animar all exist.
   Endings alone find second persons in nouns, exactly as the header says.

   So the form itself has to be interrogated:
     - never a contraction (das, nas, aos…)
     - if the treebank knows the form, its dominant tag must be VERB or AUX
     - if it does not, the form must not be the plural of a known singular
       (dias -> dia, casas -> casa, animais -> animal) */
const NOMINAL = new Set(['NOUN', 'PROPN', 'ADJ', 'DET', 'ADP', 'PRON', 'NUM', 'ADV']);
function looksNominal(form) {
  if (M.contractions[form]) return true;
  const a = M.forms[form];
  if (a && a.length) return NOMINAL.has(a[0][1]);          // dominant tag wins
  // unattested: is it just a plural?
  for (const sing of [form.replace(/s$/, ''), form.replace(/es$/, ''), form.replace(/ais$/, 'al'),
                      form.replace(/eis$/, 'el'), form.replace(/is$/, 'il')]) {
    if (sing === form) continue;
    const b = M.forms[sing];
    if ((b && b.length && NOMINAL.has(b[0][1])) || (LEM[sing] && !isVerb(sing))) return true;
  }
  return false;
}

const verbs = {}, rejected = [];
for (const form of Object.keys(freq)) {
  if (form.includes('-')) continue;
  for (const [end, inf, number, tense] of ENDINGS) {
    if (!form.endsWith(end) || form.length <= end.length) continue;
    const stem = form.slice(0, -end.length);
    const cand = stem + inf;
    if (isVerb(cand) && !looksNominal(form)) {
      verbs[form] = { lemma: cand, person: 2, number, tense };
    } else {
      rejected.push(`${form}\t${cand}\t${end}\t${freq[form]}\t${looksNominal(form) ? 'nominal' : 'no-infinitive'}`);
    }
    break;
  }
}

fs.writeFileSync(path.join(__dirname, 'por_second_person.json'),
  JSON.stringify({ pronouns: PRONOUNS, verbs }, null, 0));
fs.writeFileSync(path.join(__dirname, 'por_second_person_rejected.txt'), rejected.join('\n'));

const tok = o => Object.keys(o).reduce((a, f) => a + (freq[f] || 0), 0);
console.log('  pronouns (closed set):', Object.keys(PRONOUNS).length,
            ' tokens:', tok(PRONOUNS).toLocaleString());
console.log('  verb forms accepted  :', Object.keys(verbs).length.toLocaleString(),
            ' tokens:', tok(verbs).toLocaleString());
console.log('  candidates rejected  :', rejected.length.toLocaleString(),
            '(infinitive not attested) -> por_second_person_rejected.txt');
const ex = Object.keys(verbs).sort((a, b) => freq[b] - freq[a]).slice(0, 10);
console.log('\n  ' + ex.map(f => f.padEnd(14) + String(freq[f]).padStart(5) + '  ' +
  verbs[f].lemma + ' ' + verbs[f].number + ' ' + verbs[f].tense).join('\n  '));
