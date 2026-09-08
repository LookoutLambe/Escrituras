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
/* IN ENCLISIS THE TAIL IS A PRONOUN. `expulsaram-nos` is "they cast US out",
   but `nos` is also the contraction em+os, and the function-word table led
   with the contraction: "they-eliminated-in-the". After a hyphen only the
   pronoun reading is possible, so the tail gets its own table. */
const ENCLITIC = {
  me: 'me', te: 'you', se: 'himself', lhe: 'to-him', lhes: 'to-them',
  nos: 'us', vos: 'you', o: 'him', a: 'her', os: 'them', as: 'them',
  lo: 'him', la: 'her', los: 'them', las: 'them',
  no: 'him', na: 'her', nas: 'them',
};
/* THE GRAMMAR OUTRANKS THE STATISTICS. The closed classes — prepositions,
   conjunctions, adverbs and the fixed locutions — are exactly where a
   reference grammar is authoritative and co-occurrence is not: `ante` is
   "before" because the grammar says so, not because it happened to align.
   Read from the four grammars in grammar/; see tools/por_grammar.json. */
const G = JSON.parse(fs.readFileSync(path.join(HERE, 'por_grammar.json'), 'utf8'));
const GRAM = Object.assign({}, G.prepositions, G.conjunctions, G.adverbs);
/* THE CORPUS VOCABULARY THE MODERN DICTIONARY GETS WRONG. FreeDict is written
   for contemporary prose, so it renders `vestimentas` "toilet" (attire),
   `escória` "offscouring", `classe` "grade", `levado` "naughty" — each a real
   sense of the word and none of them the sense of the verse. Every entry here
   is read off the English column of the verses the word actually stands in.
   It sits BELOW the grammar deliberately: no hand table in front of the
   grammar, but a wrong dictionary sense is not a grammar question. */
const LEX = fs.existsSync(path.join(HERE, 'por_lexicon.json'))
  ? JSON.parse(fs.readFileSync(path.join(HERE, 'por_lexicon.json'), 'utf8')) : {};
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
const PAST = {}, PRES = {}, PASTP = {}, PPART = {}, BASEOF = {}, ENVERB = new Set();
for (const line of fs.readFileSync(path.join(HERE, 'src', 'en-verbs.txt'), 'utf8').split('\n')) {
  if (!line || line.startsWith(';;;')) continue;
  const c = line.replace(/\r$/, '').split(',');
  if (!c[0]) continue;
  PAST[c[0]] = c[10] || null;
  PPART[c[0]] = c[11] || c[10] || null;
  /* the reverse map: an inflected English verb back to its infinitive, so a
     stem that arrived as "compared" can be rebuilt as "will-compare" */
  for (const i of [3, 4, 5, 10, 11]) if (c[i] && /^[a-z]+$/.test(c[i]) && !BASEOF[c[i]]) BASEOF[c[i]] = c[0];
  PRES[c[0]] = { '1sing': c[1], '2sing': c[2], '3sing': c[3], plur: c[4] };   // be: am/are/is/are
  /* the past is inflected too for the few verbs that have it: be -> was/were.
     Columns 6-9 are 1sg, 2sg, 3sg, plural. Without these `era` (3rd singular
     imperfect of ser) took the invariant column 10 and glossed "were". */
  PASTP[c[0]] = { '1sing': c[6], '2sing': c[7], '3sing': c[8], plur: c[9] };
  /* every inflected form, not just the infinitive: the alignment returns the
     English as the King James inflects it ("began", "spake"), and telling a
     verb from a noun there needs the whole paradigm, not the headword. */
  for (const f of c) if (f && /^[a-z]+$/.test(f)) ENVERB.add(f);
}


/* THE ALIGNMENT SPEAKS KING JAMES; THE GLOSS LINE DOES NOT. The English
   column is the 1830 text, so a Portuguese preterite aligns to "asketh",
   "spake", "blest" — and `perguntou` glossed "asketh", a PRESENT English
   verb standing over a past Portuguese one. The house style is the modern
   form, exactly as it is for the second person (serás -> you-will-be, never
   "shalt"). Strip the archaic inflection and let the paradigm re-inflect it.
   The irregulars have to be listed; -eth and -est are regular enough to cut. */
const KJV = {
  saith: 'say', hath: 'have', doth: 'do', art: 'are', wast: 'was', wert: 'were',
  shalt: 'shall', wilt: 'will', canst: 'can', hast: 'have', hadst: 'had',
  didst: 'did', dost: 'do', spake: 'spoke', spakest: 'spoke', brake: 'broke',
  sware: 'swore', bare: 'bore', gat: 'got', drave: 'drove', clave: 'clung',
  wist: 'knew', durst: 'dared', builded: 'built', holpen: 'helped',
  blest: 'blessed', curst: 'cursed', girt: 'girded', gotten: 'got',
  slew: 'slew', smote: 'struck', beheld: 'saw', bade: 'bade', ye: 'you',
  /* bases too short for the general rule to touch safely */
  doest: 'do', goest: 'go', seest: 'see', beest: 'be', mayest: 'may',
  shouldest: 'should', wouldest: 'would', mightest: 'might', gavest: 'gave',
  camest: 'came', sawest: 'saw', wentest: 'went',
};
/* every English word the alignment ever proposed — 11,500 of them. A base
   the corpus never uses is not the base of an archaic form: `honesto` really
   is honestar's first singular, so the paradigm test passes it, and "honest"
   still became "hone" because hone happens to be a verb in the tables. It
   appears nowhere in this English. */
let ENSEEN = null;
function enSeen(w) {
  if (!ENSEEN) {
    ENSEEN = new Set();
    for (const k in A) for (const c of A[k]) ENSEEN.add(c[0].toLowerCase());
  }
  return ENSEEN.has(w);
}
function modernise(en, verbal) {
  if (KJV[en]) return KJV[en];
  /* -eth and -est ONLY when the Portuguese word is a verb. Stripping by shape
     alone turned `honesto` into "hone" and `Beth-` into "be": priest, lest,
     rest, west, manifest, harvest, greatest, tempest and 300 more end in -est
     without being archaic anything. The paradigm is the test — if the source
     word has no verb reading, its gloss is not a conjugated verb. */
  if (!verbal) return en;
  const m = /^(.+?)(eth|est)$/.exec(en);
  if (m && m[1].length >= 3) {
    for (const base of [m[1], m[1] + 'e', m[1].replace(/i$/, 'y')]) {
      if (PAST[base] !== undefined && enSeen(base)) return base;
    }
  }
  return en;
}

/* THE CORE VERBS, BECAUSE THE DICTIONARY MISREADS THEM. `ser` is both the verb
   "to be" and the noun "a being", and the dictionary leads with the noun — so
   `é` glossed "creature" in every verse it appeared. These are the handful
   where the wrong sense would be everywhere; the rest earn their gloss. */
const CORE = {
  ser: 'be', estar: 'be', ter: 'have', haver: 'have', ir: 'go', vir: 'come',
  fazer: 'make', dizer: 'say', dar: 'give', ver: 'see', saber: 'know',
  poder: 'can', querer: 'will', ficar: 'remain', tornar: 'become',
  dever: 'must',
};
const MODAL = { poder: 'can', dever: 'shall', querer: 'will' };
/** the infinitive behind an inflected English verb: compared -> compare */
function baseVerb(v) { return PAST[v] !== undefined ? v : (BASEOF[v] || v); }
/* en-verbs leaves the regular third singular blank, so `procura` glossed
   "seek" where English says "seeks". Person is not optional in English. */
const MODAL_EN = { must: 1, can: 1, shall: 1, will: 1, may: 1, might: 1, should: 1, ought: 1 };
function thirdSing(v) {
  if (MODAL_EN[v]) return v;                               // modals do not inflect
  if (PAST[v] === undefined || /-/.test(v)) return v;      // not a known verb
  if (/(s|sh|ch|x|z|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}
/* the English present participle, for the Portuguese gerund */
function toIng(v) {
  /* the silent -e drops (make -> making) but "be" and "see" keep it */
  if (v.length > 2 && !/ee$/.test(v) && /[^aeiou]e$/.test(v)) return v.slice(0, -1) + 'ing';
  if (/ie$/.test(v)) return v.slice(0, -2) + 'ying';
  /* a one-syllable verb ending consonant-vowel-consonant doubles it:
     split -> splitting, run -> running */
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(v)) return v + v.slice(-1) + 'ing';
  return v + 'ing';
}
/* the past PARTICIPLE, which is not the past tense: become/became/become,
   write/wrote/written. `tornado` is a participle and wants "become". */
function toPastPart(v) {
  if (PPART[v]) return modernise(PPART[v]);
  return toPast(v);
}
function toPast(v) {
  if (PAST[v]) return modernise(PAST[v]);         // irregular, listed (and en-verbs is archaic: blest)
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
  if (LEX[word]) return LEX[word];      // so humilhar -> humble reaches humilharíeis
  const g = bestFromRaw(word);
  /* one place, so the paradigm's stem is modernised too: perguntou takes its
     stem from perguntar, and without this it re-inflected "asketh". */
  return g ? modernise(g, !!(K[word] && K[word].length)) : g;
}
function bestFromRaw(word) {
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
  if (INFINITIVE.test(c[1])) return 'to-' + baseVerb(stem);
  /* the past participle is a participle, not a bare verb: permitida is
     "permitted", not "permit" */
  if (/Partic[ií]pio/i.test(c[1])) return toPastPart(stem);
  /* THE IMPERATIVE TAKES NO PERSON. English says "go", not "you-go" — and
     Portuguese imperatives are second person by definition, so the
     second-person rule was firing on every one of them: vai -> "you-go". */
  if (IMPERATIVE.test(c[1])) return baseVerb(stem);   // "knock", not "knocking"
  if (CONDITIONAL.test(c[1])) return (PERSON[pn] || '') + 'should-' + baseVerb(stem);
  if (PAST_TENSE.test(c[2])) {
    const pp = PASTP[stem];
    const f = (pp && (pp[pn] || (c[4] === 'plur' ? pp.plur : ''))) || toPast(stem);
    return (PERSON[pn] || '') + f;
  }
  /* A MODAL CARRIES ITS OWN FUTURITY. `deverão` is the future of dever and
     came out "they-will-duty"; English says "they shall". No modal takes
     "will-" in front of it. */
  if (FUTURE_TENSE.test(c[2]) && MODAL[c[0]]) return (PERSON[pn] || '') + MODAL[c[0]];
  if (FUTURE_TENSE.test(c[2])) return (PERSON[pn] || '') + 'will-' + baseVerb(stem);
  const p = PRES[stem];
  let form = (p && (p[pn] || (c[4] === 'plur' ? p.plur : ''))) ||
             (pn === '3sing' && p && p['3sing']) || stem;
  if (pn === '3sing' && form === stem) form = thirdSing(stem);
  return (PERSON[pn] || '') + form;
}

/** the gloss for one bare, lowercased token */
function glossBare(w) {
  if (GRAM[w]) return GRAM[w];                       // the grammar first
  if (LEX[w]) return LEX[w];                         // then the corpus vocabulary
  /* AND ITS AGREEMENT. The table is keyed on the masculine singular, but a
     participle or adjective agrees with its noun, so `lançada` missed it and
     took an alignment artefact — "oven". Vieyra §76 again. */
  const lexAgr = /[ao]s?$/.test(w) && LEX[w.replace(/[ao]s?$/, 'o')];
  if (lexAgr) return lexAgr;
  if (F[w]) return F[w].gloss;                       // pronoun or contraction
  if (N[w]) return N[w];                             // a name glosses to itself
  /* CORE FIRST WHEN THE WORD *IS* THE LEMMA. `ser` is the infinitive as well
     as a noun meaning "a being", and the dictionary leads with the noun — so
     the bare infinitive kept glossing "creature" even after the core table
     existed, because the table was only consulted on the conjugated path. */
  if (CORE[w]) return CORE[w];

  /* ENCLISIS IS A SPELLING OF VERB + PRONOUN, so decompose before analysing.
     The tables carry the pronominal verbs as their own lemmas (permitir-se,
     humilhar-se), so `humilhar-se` resolved as one infinitive and glossed
     "to-humilhar-se" — the word itself, with a prefix. Split first and both
     halves are ordinary. */
  /* A NON-REFLEXIVE TAIL IS AN ARGUMENT AND MUST BE GLOSSED. `disse-lhe` is
     "said unto him" and the whole-form alignment drops the "unto him"
     entirely. But `se` is not an argument — it is part of the pronominal
     verb, so aproximou-se is "approached", not "approximated-himself".
     Split for a real pronoun; trust the whole form for `se`. */
  if (w.indexOf('-') > 0 && C.splits[w] &&
      (C.splits[w][C.splits[w].length - 1] !== 'se' || !bestFrom(w))) {
    const g = splitEnclitic(w);
    if (g) return g;
  }

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
  /* THE PERSONAL INFINITIVE OUTRANKS A SAME-SHAPED SUBJUNCTIVE. `adorarem` is
     both, and the tables list the subjunctive first — so "para adorarem a
     Deus" ("for them to worship God") glossed "they-will-worship", a finite
     verb where the Portuguese has a non-finite one. After a preposition it is
     always the infinitive; the subjunctive needs a conjunction. */
  const rank = c => (IMPERATIVE.test(c[1]) ? 100 : 0) +
                    (/Infinitivo/i.test(c[1]) ? -10 : 0) +
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
  /* -ndo is the ending, but `mundo`, `fundo` and `mando` are not gerunds and
     glossed "worlding", "merging", "commanding". The gerund is built from the
     lemma's own stem — falar -> falando, comer -> comendo, partir -> partindo
     — so rebuild it and require the form to BE that. */
  /* the ending alone stays wide — pôr makes `pondo`, not "ponindo" — because
     the two tests below are what actually decide it. */
  if (/ndo$/.test(w)) {
    const gc = (K[w] || []).find(c => /Ger[uú]ndio/i.test(c[1]));
    const built = l => l && /[aei]r$/.test(l) &&
                       l.slice(0, -2) + { a: 'ando', e: 'endo', i: 'indo' }[l.slice(-2, -1)] === w;
    const lm = gc ? gc[0] : [LEM[w], M.forms[w] && M.forms[w][0][0]].find(built);
    const stem = lm && (CORE[lm] || bestFrom(lm));
    if (stem && !/-/.test(stem)) return toIng(stem);
  }

  /* AN IRREGULAR PARTICIPLE OF A CORE VERB IS THAT PARTICIPLE. feito, dito,
     visto, posto are the participles of fazer, dizer, ver, pôr — and each is
     also some obscure verb's first singular (vestir gives visto, "I wear"),
     which is what they were glossing: "I-done", "I-force", "I-clothe". The
     core verbs are exactly where the rare homograph must not win. */
  const cpart = (K[w] || []).find(c => /Partic[ií]pio/i.test(c[1]) && CORE[c[0]]);
  if (cpart && !simple.some(c => CORE[c[0]])) {
    const g = fromConj(cpart);
    if (g) return g;
  }

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

  /* A RECOGNISED VERB FORM BEATS A WEAK ALIGNMENT. `pregavam` is the
     third-plural imperfect of pregar — "they preached" — and it was glossing
     "serviceable", an alignment artefact scoring 0.25. The alignment earns
     precedence when it is confident (disse->said at 0.73, viu->saw at 0.39);
     below that the paradigm knows more than the co-occurrence does. */
  if (simple.length && !nominal(w)) {
    const a = A[w];
    /* AND A THIN ALIGNMENT IS A WEAK ONE, whatever its dice. `pedi` scored
       0.378 for "knock" on SEVEN observations, while its own lemma `pedir`
       has seventeen for "ask" — so the rare form outvoted the common one and
       glossed "I-knocked". Dice is a ratio; it says nothing about how much
       evidence produced it. */
    if (!a || !a.length || a[0][1] < 0.35 || a[0][2] < 10) {
      const g = fromConj(pick(simple));
      if (g) return g;
    }
  }

  /* THE GERUND IS UNAMBIGUOUS AND MUST READ AS ONE. `-ndo` is the gerund
     ending and nothing else in Portuguese, yet `entrando` glossed "entered" —
     the alignment's past tense, because the English column reads "entering
     into their synagogues" and `entered` is what co-occurred. A participle is
     not a finite verb; it gets the -ing form of its own lemma. */

  let direct = bestFrom(w);
  if (direct) {
    direct = modernise(direct, !!(K[w] && K[w].length));
    /* THE ALIGNMENT SUPPLIES THE VERB; THE PARADIGM SUPPLIES THE PERSON.
       `começaram` aligns confidently to "began" (0.49) — the right verb with
       its subject stripped off, because the English column reads "they began"
       and only the verb itself aligns. Portuguese carries the subject in the
       ending, so a third-plural form has to gloss "they-began"; the same rule
       that writes falamos "we-speak". The alignment only gets to choose the
       verb, never to decide who is doing it. */
    const fin = pick(simple.filter(c => !IMPERATIVE.test(c[1]) &&
                                        PERSON[c[3] + c[4]] &&
                                        !/Infinitivo|Conjuntivo/i.test(c[1])));
    if (fin && !nominal(w) && ENVERB.has(direct) && !/-/.test(direct)) {
      /* the paradigm also owns the TENSE. `perguntou` is a preterite; once
         "asketh" is modernised to "ask" it has to be re-inflected as one, or
         a past Portuguese verb reads present in English. */
      let v = direct;
      const pn = fin[3] + fin[4];
      if (PAST_TENSE.test(fin[2]) && PAST[v] !== undefined) v = toPast(v);
      else if (pn === '3sing' && !FUTURE_TENSE.test(fin[2])) v = thirdSing(v);
      return (PERSON[pn] || '') + v;
    }
    return direct;
  }

  /* THE PARTICIPLE AGREES, AND THE TABLES HOLD ONLY THE MASCULINE. Vieyra §76
     — an adjective agrees in gender and number with its noun — governs the
     past participle exactly as it governs the possessives, so the corpus is
     full of permitida, escritas, chamados while conjugation-pt.json lists
     only permitido. `permitida` therefore missed the paradigm altogether and
     fell through to its lemma, glossing "permit": a bare infinitive standing
     where the Portuguese has a participle. Reduce to the masculine singular
     and gloss the participle. Placed after the alignment and the dictionary
     on purpose — `entrada` is a noun ("entrance") that happens to look like
     one, and the evidence for those words is already in. */
  const agr = w.match(/^(.+)[ao]s?$/);
  if (agr) {
    const masc = agr[1] + 'o';
    /* masc === w is allowed when nothing finite reads the form: `tornado` is
       the participle of tornar and was taking the Infinitivo reading the
       tables also list for it, glossing "to-become" inside "haviam tornado"
       ("had made"). A participle is never an infinitive. */
    const pc = (masc !== w || !simple.length) &&
               (K[masc] || []).find(c => /Partic[ií]pio/i.test(c[1]));
    if (pc) {
      const own = bestFrom(masc);                 // bendito is aligned "blessed" already
      if (own) return own;
      const g = fromConj(pc); if (g) return g;
    }
  }

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

  return splitEnclitic(w);
}

/** disse-lhe -> said-to-him; the head is glossed, the tail is a pronoun */
function splitEnclitic(w) {
  const sp = C.splits[w];
  if (!sp) return null;
  /* the head of an enclitic form is a VERB by construction — `arrependei` is
     listed only under the pronominal lemma arrepender-se, so the paradigm
     test could not see it and "repenteth-you" kept its King James ending. */
  const parts = sp.map((p, i) => (i === 0 ? (g => (g ? modernise(g, true) : g))(glossBare(p))
                                          : (ENCLITIC[p] || (F[p] && F[p].gloss))));
  return parts.every(Boolean) ? parts.join('-') : null;
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
