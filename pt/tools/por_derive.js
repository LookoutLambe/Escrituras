/**
 * Compositional glossing — build the gloss from the grammar, not a lookup.
 *
 * Most of what was left unglossed is not missing vocabulary. It is DERIVED
 * form whose parts are already known, and Portuguese grammar says exactly how
 * they combine. A gloss may be a hyphenated phrase — the Spanish edition
 * writes it-came-to-pass and to-open-himself — so a compound Portuguese word
 * gets a compound English one.
 *
 *   semelhantemente  = semelhante + -mente     -> similarly
 *   nisso            = em + isso               -> in-that
 *   prostraram-se    = prostraram + se         -> they-prostrated-themselves
 *   trezentos        = três + centos           -> three-hundred
 *   povozinho        = povo + -zinho           -> little-people
 *   escuríssima      = escura + -íssima        -> most-dark
 *
 * Each rule strips a suffix or splits a contraction, glosses the base through
 * the ordinary pipeline, and reassembles. Nothing is guessed: if the base has
 * no gloss, the rule declines and the word stays empty.
 *
 * Exported as a function so por_gloss.js can call it; there is no separate
 * data file, because a rule is not a table.
 */
const ADV = { };   // filled by the caller-supplied base glosser

/** -mente adverbs: the feminine adjective plus the adverbial suffix. */
function mente(w, base) {
  if (!/mente$/.test(w) || w.length < 7) return null;
  const stem = w.slice(0, -5);                       // semelhante|mente
  for (const cand of [stem, stem + 'o', stem.replace(/a$/, 'o'), stem + 'e']) {
    const g = base(cand);
    if (g) return adverbise(g);
  }
  return null;
}
function adverbise(g) {
  if (/ly$/.test(g)) return g;
  if (/le$/.test(g)) return g.slice(0, -1) + 'y';    // simple -> simply
  if (/y$/.test(g)) return g.slice(0, -1) + 'ily';   // easy -> easily
  if (/ic$/.test(g)) return g + 'ally';
  return g + 'ly';
}

/** preposition + demonstrative: nisso, daquilo, naquele, doutra, nalguma */
const PREP = { n: 'in', d: 'of' };
function prepDem(w, base) {
  const m = w.match(/^([nd])(a|o|e)?(quilo|quele|quela|queles|quelas|isso|isto|ssa|sse|sta|ste|utra|utro|utras|utros|lgum|lguma|lguns|lgumas)$/);
  if (!m) return null;
  const tail = (m[2] || '') + m[3];
  const restored = { 'aquilo': 'aquilo', 'aquele': 'aquele', 'aquela': 'aquela',
    'aqueles': 'aqueles', 'aquelas': 'aquelas', 'isso': 'isso', 'isto': 'isto',
    'essa': 'essa', 'esse': 'esse', 'esta': 'esta', 'este': 'este',
    'outra': 'outro', 'outro': 'outro', 'outras': 'outro', 'outros': 'outro',
    'algum': 'algum', 'alguma': 'algum', 'alguns': 'algum', 'algumas': 'algum' }[tail];
  if (!restored) return null;
  const g = base(restored);
  return g ? PREP[m[1]] + '-' + g : null;
}

/** diminutive and superlative, both transparent */
function degree(w, base) {
  let m = w.match(/^(.+?)(zinho|zinha|zinhos|zinhas|inho|inha|inhos|inhas)$/);
  if (m) {
    for (const c of [m[1], m[1] + 'o', m[1] + 'a', m[1] + 'e']) {
      const g = base(c); if (g) return 'little-' + g;
    }
  }
  m = w.match(/^(.+?)([íi]ssimo|[íi]ssima|[íi]ssimos|[íi]ssimas)$/);
  if (m) {
    for (const c of [m[1] + 'o', m[1] + 'a', m[1], m[1] + 'e']) {
      const g = base(c); if (g) return 'most-' + g;
    }
  }
  return null;
}

/** numerals that are built from smaller ones */
const UNITS = { um: 'one', dois: 'two', duas: 'two', três: 'three', tres: 'three',
  quatro: 'four', cinco: 'five', seis: 'six', sete: 'seven', oito: 'eight',
  nove: 'nine', dez: 'ten', cem: 'hundred', cento: 'hundred', mil: 'thousand' };
const HUNDREDS = { duzentos: 'two-hundred', trezentos: 'three-hundred',
  quatrocentos: 'four-hundred', quinhentos: 'five-hundred', seiscentos: 'six-hundred',
  setecentos: 'seven-hundred', oitocentos: 'eight-hundred', novecentos: 'nine-hundred' };
function numeral(w) {
  const s = w.replace(/s$/, '').replace(/as$/, 'os');
  if (HUNDREDS[w]) return HUNDREDS[w];
  if (HUNDREDS[w.replace(/as$/, 'os')]) return HUNDREDS[w.replace(/as$/, 'os')];
  if (UNITS[w]) return UNITS[w];
  if (/^\d+$/.test(w)) return w;
  return null;
}

/** plural and feminine: strip to the citation form the lexicon holds */
function inflected(w, base) {
  const cands = [];
  if (/ns$/.test(w)) cands.push(w.slice(0, -2) + 'm');       // bens -> bem
  if (/ões$/.test(w)) cands.push(w.slice(0, -3) + 'ão');
  if (/ães$/.test(w)) cands.push(w.slice(0, -3) + 'ão');
  if (/ais$/.test(w)) cands.push(w.slice(0, -3) + 'al');
  if (/eis$/.test(w)) cands.push(w.slice(0, -3) + 'el');
  if (/óis$/.test(w)) cands.push(w.slice(0, -3) + 'ol');
  if (/is$/.test(w)) cands.push(w.slice(0, -2) + 'il');
  if (/es$/.test(w)) cands.push(w.slice(0, -2));
  if (/s$/.test(w)) cands.push(w.slice(0, -1));
  if (/a$/.test(w)) cands.push(w.slice(0, -1) + 'o');        // feminine -> masculine
  if (/as$/.test(w)) cands.push(w.slice(0, -2) + 'o');
  for (const c of cands) { const g = base(c); if (g) return g; }
  return null;
}

/* PRODUCTIVE SUFFIXES. Portuguese builds nouns off adjectives and verbs with a
   small set of endings, and each has a straight English counterpart:
     antiguidade = antigo + -dade   -> antiquity      (-dade  -> -ity/-ness)
     salvação    = salvar + -ção    -> salvation      (-ção   -> -tion)
     mandamento  = mandar + -mento  -> commandment    (-mento -> -ment)
     grandeza    = grande + -eza    -> greatness      (-eza   -> -ness)
     poderoso    = poder + -oso     -> powerful       (-oso   -> -ful/-ous)
   The base is glossed through the ordinary pipeline; only the ending is a
   rule. If the base has no gloss the rule declines. */
const SUFFIX = [
  [/(i?)dade$/,  ['o', 'e', ''],      g => nounify(g, 'ity')],
  [/[çc][ãa]o$/, ['ar', 'er', 'ir'],  g => nounify(g, 'tion')],
  [/s[ãa]o$/,    ['der', 'dir', 'ir'],g => nounify(g, 'sion')],
  [/mento$/,     ['ar', 'er', 'ir'],  g => g + 'ment'],
  [/eza$/,       ['e', 'o', ''],      g => g + 'ness'],
  [/(os[oa]|os[oa]s)$/, ['', 'o', 'e'], g => g + 'ful'],
  [/[áa]vel$/,   ['ar'],              g => g + 'able'],
  [/[íi]vel$/,   ['er', 'ir'],        g => g + 'ible'],
  [/(dor|dora|dores)$/, ['r', ''],    g => agent(g)],
];
function nounify(g, end) {
  const b = g.replace(/e$/, '');
  return b + end;
}
function agent(g) {
  if (/e$/.test(g)) return g + 'r';
  return g + 'er';
}
function suffixed(w, base) {
  for (const [re, stems, build] of SUFFIX) {
    const m = w.match(re);
    if (!m) continue;
    const stem = w.slice(0, m.index);
    for (const s of stems) {
      const g = base(stem + s);
      if (g && !/[ -]/.test(g)) return build(g);
    }
  }
  return null;
}

/* INITIALS. Single letters in this text are people's initials — W. W. Phelps,
   Oliver Cowdery's "O." — and an initial glosses to itself. They were being
   dropped by a minimum-length guard meant to catch OCR debris. */
function initial(w) {
  return /^[a-zà-ÿ]$/.test(w) ? w.toUpperCase() : null;
}

/* A VERB WHOSE LEMMA HAS NO GLOSS still has a shape. "to-<lemma>" says what
   it is — an infinitive — and keeps the reader oriented, rather than leaving
   a hole. Only reached after every other layer has declined. */
function verbShape(w, conj) {
  const c = (conj || [])[0];
  return c ? 'to-' + c[0] : null;
}

/** the whole derivational cascade, cheapest and safest first */
function derive(w, base, conj) {
  return initial(w) || numeral(w) || prepDem(w, base) || mente(w, base) ||
         degree(w, base) || inflected(w, base) || suffixed(w, base) ||
         verbShape(w, conj) || null;
}

module.exports = { derive };
