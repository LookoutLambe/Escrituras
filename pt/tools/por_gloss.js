/**
 * One Portuguese word -> one English gloss.
 *
 * Conventions taken from the Spanish edition so the two read alike:
 *   - punctuation stays attached to both sides    recibí, / I-received,
 *   - person is a hyphen prefix                   llegaron / they-came
 *   - third singular is bare                      compone / consists
 *   - a contraction glosses as its parts          del / of-the
 *
 * Portuguese adds the archaic second person the English column also uses:
 * 2sg is `thou-`, 2pl is `ye-`. That is the whole reason the conjugator was
 * needed — `disseste` is 2sg preterite of dizer, and nothing but a generated
 * paradigm can say so.
 *
 * SOURCE ORDER MATTERS. The alignment is consulted before the dictionary,
 * because a general dictionary gives the modern word and the alignment gives
 * the one this translation actually uses: `iniquidade` is "iniquity" here,
 * not "unfairness".
 *
 * Usage: node tools/por_gloss.js <book> <chapter> [verse]
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname, ROOT = path.join(HERE, '..');
const J = f => JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));
const M = J('por_morph.json'), N = J('por_names.json'), F = J('por_function.json'),
      C = J('por_clitics.json'), A = J('por_aligned.json'), D = J('por_dict.json'),
      K = J('por_conjug.json').forms;
/* The tail, glossed from the alignment evidence — see build_supplement.js.
   Consulted LAST: anything the earlier layers can settle, they should. */
/* POR_NO_SUPPLEMENT lets report_unglossed.js see what the RULE-BASED layers
   alone can do. Without it the report runs against a glosser that already
   loads this file, so it only ever lists what is still missing — and rebuilding
   the supplement from that partial list discards everything the last pass
   added. The flag makes the pipeline order-independent. */
const SUP = (process.env.POR_NO_SUPPLEMENT || !fs.existsSync(path.join(HERE, 'por_supplement.json')))
  ? {} : JSON.parse(fs.readFileSync(path.join(HERE, 'por_supplement.json'), 'utf8'));
const { derive } = require('./por_derive.js');
/* THE GRAMMAR OUTRANKS THE STATISTICS. The closed classes — prepositions,
   conjunctions, adverbs and the fixed locutions — are exactly where a
   reference grammar is authoritative and co-occurrence is not: `ante` is
   "before" because the grammar says so, not because it happened to align.
   Read from the four grammars in grammar/; see tools/por_grammar.json. */
const G = JSON.parse(fs.readFileSync(path.join(HERE, 'por_grammar.json'), 'utf8'));
const GRAM = Object.assign({}, G.prepositions, G.conjunctions, G.adverbs);
const LOCUTIONS = G.locutions;
const LEM = {};
for (const line of fs.readFileSync(path.join(HERE, 'src', 'lemmatization-pt.txt'), 'utf8').split(/\r?\n/)) {
  const [l, f] = line.split('\t');
  if (f && l) LEM[f.trim().toLowerCase()] = l.trim().toLowerCase();
}

/* The Spanish edition's shape exactly: you- for BOTH second persons, third
   singular bare, and the future carried by "will-".
     serás   -> you-will-be      habéis -> you-have
     harás   -> you-will-make    sois   -> you-are      compone -> consists */
const PERSON = { '1sing': 'I-', '2sing': 'you-', '3sing': '', '1plur': 'we-', '2plur': 'you-', '3plur': 'they-' };
const FUTURE_TENSE = /Futuro/i;
const INFINITIVE = /Infinitivo/i;
const IMPERATIVE = /Imperativo/i;

/* English past tense, from Pattern's en-verbs.txt (UPenn XTAG lineage):
   column 0 infinitive, 10 past, 11 past participle. An empty cell means the
   verb is regular. Without this, `recebi` glossed "I-receive" — present tense
   for a preterite — and every past-tense verb in the book read wrong. */
const PAST = {}, PRES = {}, PASTP = {};
for (const line of fs.readFileSync(path.join(HERE, 'src', 'en-verbs.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith(';;;')) continue;
  const c = line.replace(/\r$/, '').split(',');
  if (!c[0]) continue;
  PAST[c[0]] = c[10] || null;
  PRES[c[0]] = { '1sing': c[1], '2sing': c[2], '3sing': c[3], plur: c[4] };   // be: am/are/is/are
  /* the past is inflected too for the few verbs that have it: be -> was/were.
     Columns 6-9 are 1sg, 2sg, 3sg, plural. Without these `era` (3rd singular
     imperfect of ser) took the invariant column 10 and glossed "were". */
  PASTP[c[0]] = { '1sing': c[6], '2sing': c[7], '3sing': c[8], plur: c[9] };
}

/* THE CORE VERBS, BECAUSE THE DICTIONARY MISREADS THEM. `ser` is both the verb
   "to be" and the noun "a being", and the dictionary leads with the noun — so
   `é` glossed "creature" in every verse it appeared. These are the handful
   where the wrong sense would be everywhere; the rest earn their gloss. */
const CORE = {
  ser: 'be', estar: 'be', ter: 'have', haver: 'have', ir: 'go', vir: 'come',
  fazer: 'make', dizer: 'say', dar: 'give', ver: 'see', saber: 'know',
  poder: 'can', querer: 'will', ficar: 'remain', tornar: 'become',
};
function toPast(v) {
  if (PAST[v]) return PAST[v];                    // irregular, listed
  if (PAST[v] === null) {                         // known verb, regular
    if (/e$/.test(v)) return v + 'd';
    if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
    return v + 'ed';
  }
  return v;                                       // not a known verb: leave it
}
/* The conditional is not the past. It was folded in with it and `seria`
   glossed "were"; the Spanish edition writes sería -> should-be. */
const PAST_TENSE = /pret[eé]rito/i;
const CONDITIONAL = /Condicional/i;
const LEAD = /^[^0-9A-Za-zÀ-ÿ]+/, TRAIL = /[^0-9A-Za-zÀ-ÿ]+$/;

/* A gloss is ONE WORD under one word. The dictionary's first sense is often a
   phrase — um -> "some kind of", por -> "instead of" — so a single-word sense
   is preferred over a leading phrase. */
function pickDict(word) {
  const d = D[word];
  if (!d || !d.length) return null;
  const single = d.find(([en]) => !/\s/.test(en));
  return (single || d[0])[0];
}
/* THE ALIGNMENT ONLY WINS WHEN IT IS CONFIDENT. `todos` aligned to "men" at
   0.163 — noise from co-occurrence — while the dictionary says "all". Below
   the threshold the dictionary is the better witness; above it the alignment
   is, because it carries this translation's own register. */
const ALIGN_TRUST = 0.18;
function bestFrom(word) {
  const a = A[word] || [];
  const d = D[word] || [];
  /* TWO WITNESSES AGREEING BEATS EITHER ALONE. A common verb spreads its
     English over many renderings, so its top association is naturally low —
     receber/receive is 0.26, fazer/make 0.12 — while the dictionary's leading
     single-word sense is often the wrong one (receber -> accept, fazer ->
     achieve). Where the alignment's choice is ALSO one of the dictionary's
     senses, both sources point the same way and that is the gloss, whatever
     the dice. Only then does the raw threshold decide. */
  const senses = new Set(d.map(([en]) => en.toLowerCase()));
  for (const [en] of a) if (senses.has(en.toLowerCase())) return en;
  if (a.length && a[0][1] >= ALIGN_TRUST) return a[0][0];
  const one = pickDict(word);
  if (one) return one;
  if (a.length) return a[0][0];
  return null;
}

/** is this form really a noun wearing a verb's ending? */
const NOMINAL = new Set(['NOUN', 'PROPN', 'ADJ', 'DET', 'ADP', 'PRON', 'NUM', 'ADV']);
function nominal(w) {
  const a = M.forms[w];
  return !!(a && a.length && NOMINAL.has(a[0][1]));
}

/** render one conjugation analysis [lemma, mood, tense, person, number] */
function fromConj(c) {
  const stem = CORE[c[0]] || bestFrom(c[0]) || (LEM[c[0]] && bestFrom(LEM[c[0]]));
  if (!stem) return null;
  const pn = c[3] + c[4];
  if (INFINITIVE.test(c[1])) return 'to-' + stem;
  /* THE IMPERATIVE TAKES NO PERSON. English says "go", not "you-go" — and
     Portuguese imperatives are second person by definition, so the
     second-person rule was firing on every one of them: vai -> "you-go". */
  if (IMPERATIVE.test(c[1])) return stem;
  if (CONDITIONAL.test(c[1])) return (PERSON[pn] || '') + 'should-' + stem;
  if (PAST_TENSE.test(c[2])) {
    const pp = PASTP[stem];
    const f = (pp && (pp[pn] || (c[4] === 'plur' ? pp.plur : ''))) || toPast(stem);
    return (PERSON[pn] || '') + f;
  }
  if (FUTURE_TENSE.test(c[2])) return (PERSON[pn] || '') + 'will-' + stem;
  const p = PRES[stem];
  const form = (p && (p[pn] || (c[4] === 'plur' ? p.plur : ''))) ||
               (pn === '3sing' && p && p['3sing']) || stem;
  return (PERSON[pn] || '') + form;
}

/** the gloss for one bare, lowercased token */
function glossBare(w) {
  if (GRAM[w]) return GRAM[w];                       // the grammar first
  if (F[w]) return F[w].gloss;                       // pronoun or contraction
  if (N[w]) return N[w];                             // a name glosses to itself
  /* CORE FIRST WHEN THE WORD *IS* THE LEMMA. `ser` is the infinitive as well
     as a noun meaning "a being", and the dictionary leads with the noun — so
     the bare infinitive kept glossing "creature" even after the core table
     existed, because the table was only consulted on the conjugated path. */
  if (CORE[w]) return CORE[w];

  /* THE ALIGNMENT MIRRORS THE KING JAMES, so a second-person verb aligns to
     the archaic English the house style rejects: serás -> "shalt",
     disseste -> "saidst", farás -> "shalt". The Spanish edition writes
     you-will-be and you-said. Where the paradigm says the form is second
     person, it decides — unless the form is really a noun wearing a verb's
     ending (manjares, milhares, termos), which the treebank's dominant tag
     catches. */
  /* Among competing analyses a core verb wins: `tendes` is both ter (you have)
     and tender (you tend), and the table happens to list tender first — which
     glossed the commonest verb in the language as "you-aim". */
  /* TIES ARE BROKEN BY WHAT NARRATIVE ACTUALLY USES.
       vai  = 3sg indicative "goes" AND 2sg imperative "go" -> indicative
       foi  = preterite of BOTH ser and ir -> ser, far commoner here ("was")
     Without an order the table's own sequence decided, which is arbitrary. */
  const LEMMA_RANK = { ser: 0, estar: 1, ter: 2, haver: 3, ir: 6, vir: 6 };
  const rank = c => (IMPERATIVE.test(c[1]) ? 100 : 0) +
                    (LEMMA_RANK[c[0]] !== undefined ? LEMMA_RANK[c[0]] : (CORE[c[0]] ? 5 : 50));
  const pick = list => {
    const l = (list || []).slice().sort((a, b) => rank(a) - rank(b));
    return l[0];
  };
  /* A FORM LISTED UNDER EVERY PERSON OF A TENSE ENCODES NO PERSON.
     `nascido` carries 56 analyses: it is the past participle, and the tables
     list it for all six persons of sixteen tenses, because in every one of
     them the participle is the invariant part and the auxiliary (teria,
     tenha, tivera…) is not in the stored form. Filtering on "Composto" caught
     only half of those and still produced nascido -> "you-born",
     favorecido -> "you-coddled".
     The general test is the grouping itself: keep a reading only where this
     form is the sole person of its mood+tense. That leaves the genuinely
     person-distinctive endings — falas, disseste, sereis — and drops every
     participle and gerund, whatever the tense is called. */
  /* The gerund, the participle and the IMPERSONAL infinitive do not inflect
     for person at all — each is a one-item list, and its slot index 1 is a
     position, not a person. Left in, they are single-person groups by
     accident and `nascido` still came out "you-born". Only Infinitivo
     *Pessoal* is genuinely inflected. */
  const PERSONLESS = c => /Ger[uú]ndio|Partic[ií]pio/i.test(c[1]) ||
                          (/Infinitivo/i.test(c[1]) && !/Pessoal/i.test(c[2]));
  /* THE GROUP KEY MUST INCLUDE THE LEMMA. Keyed on mood+tense alone, two
     DIFFERENT verbs sharing a tense collapse into one group: `tendes` is ter
     (2plur present) and tender (2sing present), both "Indicativo presente",
     so they merged and the syncretism rule discarded one of them arbitrarily
     — which is why ter, the commonest verb in the language, kept losing to
     tender and glossing "you-aim". Same for foi (ir and ser). */
  const groups = {};
  for (const c of (K[w] || [])) {
    if (PERSONLESS(c)) continue;
    const key = c[0] + '|' + c[1] + '|' + c[2];
    (groups[key] = groups[key] || []).push(c);
  }
  /* SYNCRETISM IS NOT INVARIANCE. Requiring exactly one person per tense also
     threw away `seria` (143 tokens) — the conditional is identical in the 1st
     and 3rd singular, a normal Portuguese syncretism, so its group has two
     members and was discarded with the participles. The participle spans all
     SIX. Two is a real form with an ambiguous person; take the third, which
     glosses bare and is the safe reading. */
  const simple = Object.values(groups)
    .filter(g => g.length <= 2)
    .map(g => g.find(c => c[3] === '3') || g[0]);
  /* imperatives are inherently second person, so they must not drive the
     second-person preference or every one of them wins it */
  const second = pick(simple.filter(c => c[3] === '2' && !IMPERATIVE.test(c[1])));
  if (second && !nominal(w)) { const g = fromConj(second); if (g) return g; }

  /* A CORE VERB'S OWN FORMS BEAT THE DICTIONARY TOO. `era` is the imperfect of
     ser — and also an English noun, so the dictionary matched it against
     itself and glossed "era". The core verbs are exactly the set where a
     bilingual dictionary misleads, so their inflected forms take the paradigm
     as well. */
  const core = pick(simple.filter(c => CORE[c[0]]));   // pick, not find: order is arbitrary
  if (core && !nominal(w)) { const g = fromConj(core); if (g) return g; }

  const direct = bestFrom(w);
  if (direct) return direct;

  const conj = K[w];
  if (conj && conj.length) { const g = fromConj(pick(simple.length ? simple : conj)); if (g) return g; }
  const lem = LEM[w] || (M.forms[w] && M.forms[w][0][0]);
  if (lem && lem !== w) { const g = bestFrom(lem); if (g) return g; }

  if (SUP[w]) return SUP[w];

  /* BUILD IT FROM THE GRAMMAR. Most of what is left is not missing vocabulary
     but derived form whose parts are already glossed, and Portuguese says
     exactly how they combine: semelhantemente = semelhante + -mente,
     nisso = em + isso, trezentos = três + centos, povozinho = povo + -zinho.
     The gloss may be a hyphenated phrase — the Spanish edition writes
     it-came-to-pass — so a compound word gets a compound gloss. Declines
     rather than guesses when the base itself has no gloss. */
  const built = derive(w, x => (x === w ? null : glossBare(x)), K[w]);
  if (built) return built;

  const sp = C.splits[w];                            // disse-lhe -> disse + lhe
  if (sp) {
    const parts = sp.map(p => (F[p] && F[p].gloss) || glossBare(p));
    if (parts.every(Boolean)) return parts.join('-');
  }
  return null;
}

/* THE UNITS THAT MUST NOT BE SPLIT. "e aconteceu que" is "and it came to pass
   that" — four words in, one unit out; split, it becomes four unrelated
   glosses. "não obstante" is "nevertheless", not "no" + "nevertheless". The
   Spanish edition writes these as single tokens (por tanto,/therefore,) and
   the Samoan binds its TAM particles to the verb for the same reason: the
   grammar makes them one thing, so the interlinear must too.
   Longest first, so "e aconteceu que" wins over "aconteceu que". */
const UNITS = Object.assign({}, LOCUTIONS,
  fs.existsSync(path.join(HERE, 'por_units.json'))
    ? JSON.parse(fs.readFileSync(path.join(HERE, 'por_units.json'), 'utf8')) : {});
const UNIT_KEYS = Object.keys(UNITS).sort((a, b) => b.split(' ').length - a.split(' ').length);
const MAX_UNIT = Math.max(2, ...UNIT_KEYS.map(k => k.split(' ').length));

/** join the multiword units in a verse into single tokens, before glossing */
function tokenise(text) {
  const raw = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length;) {
    let joined = null;
    for (let n = Math.min(MAX_UNIT, raw.length - i); n >= 2 && !joined; n--) {
      const slice = raw.slice(i, i + n);
      const key = slice.join(' ').toLowerCase().replace(/^[^0-9a-zà-ÿ]+|[^0-9a-zà-ÿ]+$/g, '');
      if (UNITS[key]) joined = { text: slice.join(' '), n, gloss: UNITS[key] };
    }
    if (joined) { out.push(joined); i += joined.n; }
    else { out.push({ text: raw[i], n: 1, gloss: null }); i += 1; }
  }
  return out;
}

/** keep the punctuation the source token carries */
function gloss(token) {
  const lead = (token.match(LEAD) || [''])[0];
  const trail = (token.match(TRAIL) || [''])[0];
  const bare = token.slice(lead.length, token.length - trail.length);
  /* PUNCTUATION IS NOT A WORD. A standalone em-dash — the Portuguese edition
     uses them heavily for parenthetical asides — carries no lexical content
     and needs no translation; it stands for itself. 704 tokens. */
  if (!bare) return token;
  let g = glossBare(bare.toLowerCase());

  /* LAST RESORT, IN ORDER. Everything above has declined, so what is left is
     one of four things and each says what it is:
       a scripture reference (20:12, 3:18–20)  -> itself
       a capitalised word nothing explains     -> a name, and a name is itself
       a weak alignment candidate              -> the English column's own word
       anything else                           -> itself, rather than a hole
     A word glossed as itself is honest: it tells the reader the form was not
     resolved, which a blank does not. */
  if (!g && /^[0-9]+([:\u2013-][0-9]+)*$/.test(bare)) g = bare;
  if (!g && /^[A-ZÀ-Þ]/.test(bare) && bare.length > 1) {
    g = bare[0].toUpperCase() + bare.slice(1).toLowerCase();
  }
  if (!g) {
    const a = A[bare.toLowerCase()];
    if (a && a.length) g = a[0][0];
  }
  if (!g) g = bare;
  
  /* A capitalised source word keeps its capital: Deus -> God, not god. */
  if (/^[A-ZÀ-Þ]/.test(bare) && /^[a-z]/.test(g)) g = g[0].toUpperCase() + g.slice(1);
  return lead + g + trail;
}

if (require.main === module) {
  const [book, chap, verse] = process.argv.slice(2);
  const file = path.join(ROOT, 'dual', book + '.json');
  if (!book || !fs.existsSync(file)) {
    console.error('usage: node tools/por_gloss.js <book> <chapter> [verse]   e.g. 1nephi 1');
    process.exit(1);
  }
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = d.rows.filter(r => String(r.chapter) === String(chap) && (!verse || String(r.verse) === String(verse)));
  let tot = 0, hit = 0;
  for (const r of rows) {
    const toks = r.pt.split(/\s+/).filter(Boolean);
    console.log(`\n${d.book} ${r.chapter}:${r.verse}`);
    console.log('  ' + toks.map(t => { const g = gloss(t); tot++; if (g) hit++; return t + '/' + (g || '—'); }).join('  '));
    if (r.en) console.log('  EN: ' + r.en);
  }
  console.log(`\n  ${hit}/${tot} tokens glossed (${(100 * hit / tot).toFixed(1)}%)`);
}
module.exports = { gloss, glossBare, tokenise };
