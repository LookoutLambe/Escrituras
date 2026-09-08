/**
 * Forms the grammar says are AMBIGUOUS, resolved per occurrence.
 *
 * Vieyra/Brangoog §76: "The possessive pronouns are inflected like adjectives
 * and agree in gender and number with the OBJECT POSSESSED." §83 glosses them
 * "his, her or your". So seu/sua/seus/suas say nothing about who possesses —
 * suas sinagogas is "their synagogues" when the subject is plural and "his
 * synagogues" when it is singular, and the FORM is identical either way.
 *
 * A single fixed gloss is therefore wrong by construction. Measured over the
 * corpus: suas is "their" 53% of the time and "his" 34%; seus is 48/39. Any
 * one choice misglosses tens of thousands of words.
 *
 * But the English of the very verse is sitting right there, so the ambiguity
 * is resolvable per occurrence: whichever candidate the verse's English
 * actually uses is the gloss for that occurrence. Where the verse gives no
 * evidence, the corpus-wide majority stands in.
 *
 * The same applies to the clitics — lhe is to-him/to-her/to-you, lhes is
 * to-them/to-you, se is himself/herself/themselves.
 */

/* form -> [candidate glosses, most common first]. The first is the fallback
   when the verse says nothing. */
const AMBIGUOUS = {
  'seu':  [['his', 'his'], ['their', 'their'], ['her', 'her'], ['your', 'your'], ['its', 'its']],
  'sua':  [['his', 'his'], ['their', 'their'], ['her', 'her'], ['your', 'your'], ['its', 'its']],
  'seus': [['their', 'their'], ['his', 'his'], ['her', 'her'], ['your', 'your']],
  'suas': [['their', 'their'], ['his', 'his'], ['her', 'her'], ['your', 'your']],
  'lhe':  [['to-him', 'him'], ['to-her', 'her'], ['to-you', 'you']],
  'lhes': [['to-them', 'them'], ['to-you', 'you']],
  'se':   [['himself', 'himself'], ['themselves', 'themselves'], ['herself', 'herself'],
           ['yourself', 'yourself'], ['itself', 'itself']],
  /* `via` is the first and third singular imperfect of ver AND the noun
     "road". The dictionary has only the noun, so "those whom he beheld"
     glossed "road". Scripture says caminho for a road; here it is the verb
     unless the English actually names a way. */
  /* GENUINELY TWO-SENSED, so the verse's English chooses. `real` is "royal"
     in 45 verses ("a royal priesthood", "the seed royal") and "real" in Alma
     32:35 ("is not this real?"); a single entry is wrong either way. */
  'real':      [['royal', 'royal'], ['real', 'real']],
  'reais':     [['royal', 'royal'], ['real', 'real']],
  /* santo is "holy" as an adjective and "saint" as a noun, and both are
     everywhere in this corpus */
  'santo':  [['holy', 'holy'], ['saint', 'saint']],
  'santa':  [['holy', 'holy'], ['saint', 'saint']],
  'santos': [['saints', 'saints'], ['holy', 'holy']],
  'santas': [['holy', 'holy'], ['saints', 'saints']],
  'cultivar':   [['nourish', 'nourish'], ['till', 'till']],
  'cultivardes':[['nourish', 'nourish'], ['till', 'till']],
  'colhereis':  [['you-will-pluck', 'pluck'], ['you-will-reap', 'reap']],
  'colheis':    [['you-pluck', 'pluck'], ['you-reap', 'reap']],
  /* terra is "earth" and "land" in equal measure here */
  /* pais is "parents" and "fathers" — 1 Nephi 1:1 says goodly parents, 4:2
     says our fathers */
  'pais':  [['parents', 'parents'], ['fathers', 'fathers']],
  /* regozijo is the noun "rejoicing" and the first singular "I rejoice" */
  'regozijo': [['rejoicing', 'rejoicing'], ['I-rejoice', 'rejoice']],
  /* ele/ela and dele/dela are "he/she" of a person and "it" of a thing —
     "ele encheu-me a alma" is the FRUIT filling the soul */
  'ele':   [['he', 'he'], ['it', 'it']],
  'eles':  [['they', 'they'], ['them', 'them']],
  'dele':  [['of-him', 'him'], ['of-it', 'it'], ['his', 'his']],
  'dela':  [['of-her', 'her'], ['of-it', 'it']],
  'esforço': [['diligence', 'diligence'], ['effort', 'effort'],
              ['pressing', 'pressing']],
  'levantou': [['arose', 'arose'], ['raised', 'raise']],
  'entre':    [['among', 'among'], ['between', 'between']],
  'terra':  [['earth', 'earth'], ['land', 'land'], ['ground', 'ground']],
  'terras': [['lands', 'lands'], ['earth', 'earth']],
  'poder':  [['power', 'power'], ['can', 'can']],
  'colher':    [['pluck', 'pluck'], ['reap', 'reap'], ['gather', 'gather']],
  'esperando': [['waiting', 'waiting'], ['hoping', 'hoping'],
                ['looking-forward', 'looking']],
  'ela':  [['she', 'she'], ['it', 'it'], ['her', 'her']],
  'elas': [['they', 'they'], ['them', 'them']],
  /* `vira` is the pluperfect of ver ("the things which he had seen") and the
     third singular of virar ("turn thee eastward") */
  'vira': [['turns', 'turn'], ['had-seen', 'seen'], ['had-seen', 'saw']],
  'via':  [['road', 'road'], ['way', 'way'], ['saw', 'saw'], ['saw', 'beheld'], ['saw', 'see']],
};
/* forms whose FALLBACK is not the first candidate — listed first because the
   English probe for the majority reading is the weaker one */
const FALLBACK = { via: 'saw', vira: 'had-seen', terra: 'land', pais: 'fathers',
                   'esforço': 'diligence', levantou: 'arose', entre: 'among', real: 'royal', colher: 'reap', esperando: 'waiting',
                   cultivar: 'till', cultivardes: 'till',
                   colhereis: 'you-will-reap', colheis: 'you-reap' };

/** the reflexive pronoun agreeing with the verb it leans on */
function reflexiveFor(v, en) {
  const cs = (K[v] || []).filter(c => c[4] && !/Infinitivo|Ger[uú]ndio|Partic/i.test(c[1]));
  const c = cs.find(x => x[3] === '3') || cs[0];
  if (!c) return null;                       // unknown: let the English decide
  if (c[4] === 'plur') return c[3] === '1' ? 'ourselves' : 'themselves';
  if (c[3] === '1') return 'myself';
  if (c[3] === '2') return 'thyself';
  const words = new Set(String(en || '').toLowerCase().split(/[^a-z]+/));
  for (const cand of ['itself', 'herself', 'himself']) if (words.has(cand)) return cand;
  return 'himself';
}

/** the English words of the verse, lowercased */
function enWords(en) {
  return new Set(String(en || '').toLowerCase().split(/[^a-z]+/).filter(Boolean));
}

/**
 * Resolve one ambiguous form against its verse's English.
 * Returns null when the form is not ambiguous — the caller then glosses
 * it the ordinary way.
 */
function resolve(form, en) {
  const cands = AMBIGUOUS[form];
  if (!cands) return null;
  const words = enWords(en);
  /* the English is inflected: "in nourishing it" does not contain the bare
     "nourish". A long probe may match as a prefix; a short one must not, or
     "real" would answer to "really". */
  const seen = p => words.has(p) ||
                    (p.length >= 5 && [...words].some(w => w.startsWith(p)));
  for (const [gloss, probe] of cands) if (seen(probe)) return gloss;
  return FALLBACK[form] || cands[0][0];      // no evidence: the majority reading
}


/* ── THE SYNTACTIC AMBIGUITIES ────────────────────────────────────────────
 *
 * The forms above are resolved by the verse's English. These are resolved by
 * the words on either side, because Portuguese distinguishes them by position
 * and nothing else. A glosser that sees one token at a time cannot get any of
 * them right, and each is thousands of tokens.
 */
const fs = require('fs'), path = require('path');
const K = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_conjug.json'), 'utf8')).forms;
const MF = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_morph.json'), 'utf8')).forms;

const isVerb = w => !!(w && K[w] && K[w].length);
/* a past participle: the tables hold only the masculine, so allow agreement */
function isParticiple(w) {
  if (!w) return false;
  const masc = w.replace(/[ao]s?$/, 'o');
  return (K[w] || []).some(c => /Partic[ií]pio/i.test(c[1])) ||
         (K[masc] || []).some(c => /Partic[ií]pio/i.test(c[1]));
}
const isInfin = w => !!(w && K[w] && K[w].some(c => /Infinitivo/i.test(c[1])));
/** the treebank's dominant gender for a form, or null */
function gender(w) {
  const a = MF[w] || [];
  for (const r of a) {
    const m = /Gender=(Fem|Masc)/.exec(r[2] || '');
    if (m && /NOUN|PROPN|ADJ/.test(r[1])) return m[1] === 'Fem' ? 'f' : 'm';
  }
  /* THE TREEBANK IS 546,493 TOKENS AND THE CORPUS IS SCRIPTURE, so plenty of
     its nouns are simply absent — `recompensa` among them, which left "a
     recompensa" as "to reward" instead of "the reward". Portuguese marks
     gender in the ending reliably enough to stand in when nothing is known. */
  if (/(ção|dade|agem|eza|ência|ância|tude|ice)$/.test(w)) return 'f';
  if (/(mento|ismo|ário)$/.test(w)) return 'm';
  if (/a$/.test(w)) return 'f';
  if (/(o|or|ês)$/.test(w)) return 'm';
  return null;
}

/**
 * `a` IS BOTH THE FEMININE ARTICLE AND THE PREPOSITION, AND GENDER DECIDES.
 * The masculine article is `o`, so an `a` standing before a masculine noun
 * cannot be an article — it is the preposition. Before a feminine noun it
 * cannot be the preposition's usual object either; it is the article.
 *   a palavra   -> "the word"    (palavra is feminine)
 *   a Deus      -> "to God"      (Deus is masculine)
 *   a pregar    -> "to preach"   (an infinitive, so the preposition)
 * The glosser had the grammar's flat "to" for all of them, which read
 * "began to preach to word of God" — the commonest wrong gloss in the book.
 * Adjectives can stand between, so look ahead for the first gendered word.
 */
/* THE ARTICLE IS ALSO THE OBJECT PRONOUN, AND POSITION SEPARATES THEM. A
   proclitic pronoun stands immediately before its verb — "os haviam tornado"
   is "had made THEM", and it glossed "the". Before a noun the same form is
   the article. */
/* the feminine object pronoun refers to a thing far more often than to a
   person here (a palavra, a vontade, a fé): "não a pratica" is "doeth it not" */
const DET = { um: 1, uma: 1, uns: 1, umas: 1, o: 1, a: 1, os: 1, as: 1,
              este: 1, esta: 1, esse: 1, essa: 1, aquele: 1, aquela: 1,
              meu: 1, minha: 1, seu: 1, sua: 1, nosso: 1, nossa: 1,
              vosso: 1, vossa: 1, teu: 1, tua: 1, cada: 1, todo: 1, toda: 1 };
const POSS = { meu: 1, minha: 1, meus: 1, minhas: 1, teu: 1, tua: 1, teus: 1, tuas: 1,
               seu: 1, sua: 1, seus: 1, suas: 1, nosso: 1, nossa: 1, nossos: 1,
               nossas: 1, vosso: 1, vossa: 1, vossos: 1, vossas: 1 };
const OBJ = { o: 'him', a: 'it', os: 'them', as: 'them' };
const OBJ_EN = { o: ['him', 'it'], a: ['it', 'her'] };
/* the next word has to be a verb and NOTHING ELSE: "os humildes" is "the
   humble", and humildes parses as a verb form too, so a bare isVerb() test
   turned the article into "them". The treebank's own tag settles it. */
function nounish(w) {
  const a = MF[w];
  return !!(a && a.length && /NOUN|PROPN|ADJ/.test(a[0][1]));
}
/* THE DEVERBAL NOUN WEARS A SINGULAR PRESENT ENDING, in both persons.
   castigo, desejo, começo are nouns AND the first singular of castigar; the
   PLURALS are the second singular — profetas, coisas, obras, palavras all
   parse as `tu` forms of verbs nobody uses. So "o castigo" glossed "him
   punishment" and "com os profetas" glossed "with them prophets".
   Neither person is evidence of a verb on its own: this corpus has 1,637 `tu`
   tokens against tens of thousands of plural nouns. */
function finiteBeyondDeverbal(w) {
  const cs = (K[w] || []).filter(c => !/Infinitivo|Ger[uú]ndio|Partic/i.test(c[1]));
  const deverbal = c => c[4] === 'sing' && /presente/i.test(c[2]) &&
                        (c[3] === '1' || c[3] === '2');
  return cs.length > 0 && cs.some(c => !deverbal(c));
}
function objectPronoun(form, after, before, en) {
  const n = after[0];
  /* A VERB IN FRONT GOVERNS THE PREPOSITION. "exorto a perguntardes" is
     "exhort you TO ask" — exortar takes `a`; but "não a lançardes" is "cast
     IT out". What separates them is whether a verb precedes. */
  const prev = before[before.length - 1];
  if (prev && isVerb(prev) && !nounish(prev)) return null;
  if (!finiteBeyondDeverbal(n)) return null;
  /* the bare infinitive after `a` is the preposition's complement ("a
     pregar"), but an INFLECTED infinitive is not — "se não a lançardes fora"
     is "if ye do not cast IT out", and glossed "to". */
  /* an enclitic rides on the infinitive: "começa a dilatar-me" is still
     "begins TO enlarge me", so test the head, not the whole token */
  const head = String(n || '').split('-')[0];
  const bareInfinitive = /[aei]r$/.test(head) && (isInfin(n) || isInfin(head));
  /* a determiner cannot follow an object pronoun: "para a sua maravilhosa
     luz" is "unto HIS marvellous light", and `sua` parses as a verb form
     (suar), so the pronoun reading fired and glossed `a` as "it". */
  if (DET[n]) return null;
  if (!(isVerb(n) && !bareInfinitive && !nounish(n))) return null;
  /* him or it — "bade him that he should read IT" and "twelve others
     following HIM" are the same `o`. The English of the verse decides. */
  const alt = OBJ_EN[form];
  if (alt) {
    const words = new Set(String(en || '').toLowerCase().split(/[^a-z]+/));
    for (const c of alt) if (words.has(c)) return c;
    return alt[0];
  }
  return OBJ[form];
}

function article(form, after) {
  const plural = form === 'as';
  /* AN ARTICLE CANNOT PRECEDE ANOTHER DETERMINER. "comparar a palavra a uma
     semente" is "to a seed", and the gender scan looked straight past `uma`
     to `semente` and called it "the". */
  /* A POSSESSIVE IS NOT A RIVAL DETERMINER. Portuguese writes the article
     BEFORE the possessive — "a tua semente" is "thy seed", "para a sua luz"
     is "into his light" — so only a true indefinite or demonstrative in that
     slot means the `a` is the preposition. */
  if (DET[after[0]] && !POSS[after[0]]) return 'to';
  for (let i = 0; i < 3 && i < after.length; i++) {
    const w = after[i];
    if (!w) break;
    /* A POSSESSIVE AGREES WITH ITS NOUN, so it can never settle the gender —
       scan past it to the head. The treebank tags `tua` PROPN/Masc, one
       stray row, and that alone turned "a tua semente" into "to thy seed". */
    if (POSS[w]) continue;
    /* an enclitic rides on the infinitive: "começa a ser-me deliciosa" is
       still "begins TO be delicious to me" */
    const head = w.split('-')[0];
    if (isInfin(w) || (/[aei]r$/.test(head) && isInfin(head))) return 'to';
    const g = gender(w);
    if (g === 'f') return 'the';
    if (g === 'm') return 'to';
    if (plural && /s$/.test(w)) continue;           // keep scanning past adjectives
  }
  return plural ? 'the' : 'to';
}

/**
 * `se` IS THE CONJUNCTION "if" AND THE REFLEXIVE PRONOUN, and the reflexive
 * is PROCLITIC — it stands immediately before its verb. So `se` followed by
 * anything that is not a verb form is the conjunction. "se assim é" is "if
 * so it is", and it was glossing "himself thus is".
 */
const AUX = { ser: 1, estar: 1, ter: 1, haver: 1, poder: 1, dever: 1 };
/* only a FINITE auxiliary. "se é compelido" is "if he is compelled", but
   "depois de se haverem escondido" is "after they had hid THEMSELVES" — the
   infinitive `haverem` heads a compound verb, and the reflexive is its own. */
function isAux(w) {
  return !!(w && (K[w] || []).some(c => AUX[c[0]] &&
    !/Infinitivo|Ger[uú]ndio|Partic/i.test(c[1])));
}
/* an INFINITIVE the tables do not carry as a plain lemma — arrepender is
   listed only as arrepender-se, so isVerb missed it and "quem se arrepender"
   ("whosoever repenteth") came out "who if repent" */
function looksInfinitive(w) {
  return /[aei]r$/.test(w) && (isInfin(w) || !!K[w + '-se']);
}
const CLAUSE = { e: 1, mas: 1, ou: 1, porque: 1, pois: 1, portanto: 1, que: 1,
                 'e,': 1, ora: 1, sim: 1, agora: 1 };
/**
 * `se` IS THE CONJUNCTION "if" AND THE REFLEXIVE/PASSIVE PRONOUN, and what
 * separates them is CLAUSE POSITION, not the next word. A reflexive stands
 * inside its clause, attached to its verb; the conjunction opens one.
 *
 *   "eis que, se despertardes"      -> if      (a new clause: the comma)
 *   "coisas que se não veem"        -> passive (inside a relative clause)
 *   "quem se arrepender"            -> reflexive
 *
 * Reading only the following word cannot tell these apart — every one of them
 * is followed by a verb. `se derdes` and `se despertardes` both glossed
 * "himself" for exactly that reason.
 */
function seGloss(after, before, prevRaw, en) {
  const prev = before[before.length - 1];
  /* a clause boundary in front of it: the conjunction */
  if (!prev || /[,;:—-]$/.test(prevRaw || '') || CLAUSE[prev] === 1 && prev !== 'que') return 'if';
  if (prev === 'que') {
    /* the passive `se` agrees with its verb: "coisas que se não veem" is
       plural ("are not seen"), "multidão que se compunha" is singular */
    const v = after.find(x => isVerb(x));
    const c = v && (K[v] || []).find(x => x[4]);
    return c && c[4] === 'plur' ? 'themselves' : 'itself';
  }
  const n = after[0];
  /* A REFLEXIVE DOES NOT ATTACH TO A COPULA. "se é compelido" is "if he is
     compelled"; "se arrepender" is the pronominal verb. */
  if (isAux(n)) return 'if';
  /* THE PROCLITIC REFLEXIVE AGREES WITH ITS VERB, exactly as the enclitic
     does. `se extraviaram` is third plural — "they wandered off" — and the
     flat table made every one of them "himself". */
  if (isVerb(n) || looksInfinitive(n)) return reflexiveFor(n, en);
  /* THE REFLEXIVE IS PROCLITIC — it stands against its verb and nothing else.
     So when the next word is tagged a noun, adjective, adverb or pronoun,
     this `se` cannot be the pronoun: "para ver se acaso descobriria" is "to
     see IF perchance". When the next word is unknown to the treebank it is
     almost always a verb form the tables simply lack ("também se apoderara"),
     and that is the reflexive. */
  const tag = (MF[n] || [])[0];
  if (tag && /NOUN|ADJ|ADV|PRON|DET|NUM/.test(tag[1])) return 'if';
  return null;
}

/**
 * `até` IS "until" BEFORE A NOUN AND "even" BEFORE A VERB. Vieyra lists both.
 * "e até pregavam" is "and they even preached", not "and until they preached".
 */
function ate(after) { return isVerb(after[0]) || after[0] === 'que' ? 'even' : 'until'; }

/**
 * Resolve one token against its neighbours. `after` is the following bare
 * tokens in order. Returns null when position decides nothing.
 */
/**
 * `fora` IS THE ADVERB "out" AND THE PLUPERFECT OF ser, and what precedes it
 * separates them across all 573 tokens:
 *   para fora / de fora / lança fora   -> the adverb  (out, outside)
 *   que fora / lhes fora / não fora    -> "had been"  ("as though he were not
 *                                         wood", "which had been ordained")
 * The adverb is the majority, so it stays the default.
 */
const FORA_VERBAL = { que: 1, lhe: 1, lhes: 1, me: 1, te: 1, nos: 1, vos: 1,
                      se: 1, 'não': 1 };
function fora(before) {
  return FORA_VERBAL[before[before.length - 1]] ? 'had-been' : 'outside';
}

/* `para` + INFINITIVE IS "to", NOT "for". "para adorarem a Deus" is "to
   worship God"; the grammar's flat "for" made it "for worship God". */
function para(after) { return isInfin(after[0]) ? 'to' : null; }

function resolveSyntax(form, after, before, raw, prevRaw, en) {
  before = before || [];
  if (OBJ[form]) { const o = objectPronoun(form, after, before, en); if (o) return o; }
  if (form === 'a' || form === 'as') return article(form, after);
  if (form === 'para') return para(after);
  if (form === 'fora') return fora(before);
  /* `outro` BEFORE ITS NOUN IS "other"; standing alone it is "others".
     "em outras palavras" is "in other words", and it read "in others
     words"; "vi outros avançando" really is "I beheld others". */
  if (/^outr[oa]s?$/.test(form)) {
    const n = after[0];
    if (nounish(n) || (gender(n) && !isVerb(n))) return 'other';
    return /s$/.test(form) ? 'others' : 'another';
  }
  /* A DEMONSTRATIVE BEFORE ITS NOUN IS "that", NOT "he". `aquele` standing
     alone is "he that"; `aquela grande cidade` is "that great city", and it
     glossed "she great city". */
  const dem = /^(aquel|ess|est)([eao]s?)$/.exec(form);
  if (dem) {
    for (let i = 0; i < 3 && i < after.length; i++) {
      if (nounish(after[i]) || gender(after[i])) {
        const pl = /s$/.test(form);
        return dem[1] === 'est' ? (pl ? 'these' : 'this') : (pl ? 'those' : 'that');
      }
      if (isVerb(after[i])) break;
    }
  }
  /* `haver` IS THE AUXILIARY "have" AND THE EXISTENTIAL "there is", and the
     participle after it decides: "havia mostrado" is "HAD shown", while "há
     muitos que dizem" is "THERE ARE many". A flat existential gloss made the
     commonest auxiliary in the book read "there-was shown". */
  if (form === 'há' || form === 'havia' || form === 'houve' || form === 'haverá') {
    const HAVE = { 'há': 'has', havia: 'had', houve: 'had', 'haverá': 'will-have' };
    const THERE = { 'há': 'there-is', havia: 'there-was', houve: 'there-was',
                    'haverá': 'there-will-be' };
    return isParticiple(after[0]) ? HAVE[form] : THERE[form];
  }
  /* `nos` IS BOTH "us" AND em+os. A proclitic pronoun stands before its verb;
     before a noun the same letters are the contraction. "Alto nos céus está o
     teu trono" is "high in the heavens", and it glossed "us heaven". */
  if (form === 'nos') {
    const n = after[0];
    return isVerb(n) && !nounish(n) && !DET[n] ? 'us' : 'in-the';
  }
  if (form === 'se') return seGloss(after, before, prevRaw, en);
  if (form === 'até') return ate(after);
  /* `mesmo` AFTER A PRONOUN IS "-self". "a vós mesmos" is "within
     yourselves"; on its own `mesmo` is "even" or "same". */
  if (/^mesm[oa]s?$/.test(form)) {
    const prev = before[before.length - 1];
    const SELF = { vós: 'yourselves', vos: 'yourselves', nós: 'ourselves',
                   si: 'themselves', ti: 'thyself', mim: 'myself', ele: 'himself',
                   ela: 'herself', eles: 'themselves', elas: 'themselves',
                   eu: 'myself', tu: 'thyself' };
    if (SELF[prev]) return SELF[prev];
    /* between a determiner and its noun it is "same": "nesse mesmo ano" is
       "that same year", and it was reading "in-that even year" */
    if (nounish(after[0]) || gender(after[0])) return 'same';
    if (DET[prev] || /^(n?[oa]s?|ness[ea]|nest[ea]|aquel[ea]s?)$/.test(prev || '')) return 'same';
  }

  /* a `não` that ENDS its sentence is the answer "no"; before a verb it is
     the negation "not". The rest of the verse is not the test — the token's
     own punctuation is. */
  if (form === 'não') return /[.!?;]$/.test(raw || '') ? 'no' : 'not';
  return null;
}


/**
 * A CAPITAL IS EVIDENCE, AND THE ENGLISH COLUMN CONFIRMS IT. `Alma` is the
 * prophet and `alma` is a soul — the same letters, told apart by the capital
 * alone, and the glosser lowercases before it looks anything up. So Alma the
 * prophet glossed "Soul" in every verse of his own book.
 *
 * The registry cannot hold this: alma is an ordinary word, and a flat entry
 * would turn every soul in the Book of Mormon into a proper name. The
 * decision is per occurrence, and the evidence is the English of the very
 * verse: if the token is capitalised and the SAME word stands capitalised
 * mid-sentence in the English, that is the name, in that verse.
 */
function properName(raw, bare, en) {
  if (!raw || !/^[A-ZÀ-Þ]/.test(raw) || bare.length < 3) return null;
  const re = new RegExp('(^|[^.!?]\\s)\\s*(' + bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i');
  const m = re.exec(String(en || ''));
  if (!m) return null;
  return /^[A-Z]/.test(m[2]) ? m[2] : null;    // capitalised mid-sentence: a name
}

/**
 * The whole contextual layer, in the order the grammar wants it: position
 * first (it is decisive when it applies), then the verse's English.
 * `after` is the following bare tokens of the verse, in order.
 */
/**
 * The whole contextual layer, in the order the grammar wants it: a proper
 * name, then position, then the verse's English.
 *   form    the bare lowercased token
 *   o.after / o.before   the verse's other bare tokens, in order
 *   o.raw / o.prevRaw    those two tokens WITH their punctuation
 *   o.en                 the English of the verse
 */
function contextual(form, o) {
  o = o || {};
  return properName(o.raw, form, o.en) ||
         resolveSyntax(form, o.after || [], o.before || [], o.raw, o.prevRaw, o.en) ||
         resolve(form, o.en);
}

module.exports = { resolve, resolveSyntax, contextual, properName, AMBIGUOUS };
