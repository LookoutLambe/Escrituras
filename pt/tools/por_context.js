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
  'poder':  [['power', 'power'], ['can', 'can']],
  'colher':    [['pluck', 'pluck'], ['reap', 'reap'], ['gather', 'gather']],
  'esperando': [['waiting', 'waiting'], ['hoping', 'hoping'],
                ['looking-forward', 'looking']],
  'ela':  [['she', 'she'], ['it', 'it'], ['her', 'her']],
  'elas': [['they', 'they'], ['them', 'them']],
  'via':  [['road', 'road'], ['way', 'way'], ['saw', 'saw'], ['saw', 'beheld'], ['saw', 'see']],
};
/* forms whose FALLBACK is not the first candidate — listed first because the
   English probe for the majority reading is the weaker one */
const FALLBACK = { via: 'saw', real: 'royal', colher: 'reap', esperando: 'waiting',
                   cultivar: 'till', cultivardes: 'till',
                   colhereis: 'you-will-reap', colheis: 'you-reap' };

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
const OBJ = { o: 'him', a: 'it', os: 'them', as: 'them' };
/* the next word has to be a verb and NOTHING ELSE: "os humildes" is "the
   humble", and humildes parses as a verb form too, so a bare isVerb() test
   turned the article into "them". The treebank's own tag settles it. */
function nounish(w) {
  const a = MF[w];
  return !!(a && a.length && /NOUN|PROPN|ADJ/.test(a[0][1]));
}
/* THE DEVERBAL NOUN WEARS THE FIRST-SINGULAR ENDING. castigo, desejo,
   trabalho, começo are nouns AND the first singular present of castigar,
   desejar… so "o castigo" ("the chastisement") read as pronoun + verb and
   glossed "him punishment". A form whose ONLY verb reading is 1st singular
   present is not evidence of a verb. */
function finiteNot1sg(w) {
  const cs = (K[w] || []).filter(c => !/Infinitivo|Ger[uú]ndio|Partic/i.test(c[1]));
  return cs.length > 0 && cs.some(c => !(c[3] === '1' && c[4] === 'sing' && /presente/i.test(c[2])));
}
function objectPronoun(form, after, before) {
  const n = after[0];
  /* A VERB IN FRONT GOVERNS THE PREPOSITION. "exorto a perguntardes" is
     "exhort you TO ask" — exortar takes `a`; but "não a lançardes" is "cast
     IT out". What separates them is whether a verb precedes. */
  const prev = before[before.length - 1];
  if (prev && isVerb(prev) && !nounish(prev)) return null;
  if (!finiteNot1sg(n)) return null;
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
  return isVerb(n) && !bareInfinitive && !nounish(n) ? OBJ[form] : null;
}

function article(form, after) {
  const plural = form === 'as';
  /* AN ARTICLE CANNOT PRECEDE ANOTHER DETERMINER. "comparar a palavra a uma
     semente" is "to a seed", and the gender scan looked straight past `uma`
     to `semente` and called it "the". */
  if (DET[after[0]]) return 'to';
  for (let i = 0; i < 3 && i < after.length; i++) {
    const w = after[i];
    if (!w) break;
    if (isInfin(w)) return 'to';                    // a pregar, a ter
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
function isAux(w) { return !!(w && (K[w] || []).some(c => AUX[c[0]])); }
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
function seGloss(after, before, prevRaw) {
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
  if (isVerb(n) || looksInfinitive(n)) return null;
  return 'if';
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
/* `para` + INFINITIVE IS "to", NOT "for". "para adorarem a Deus" is "to
   worship God"; the grammar's flat "for" made it "for worship God". */
function para(after) { return isInfin(after[0]) ? 'to' : null; }

function resolveSyntax(form, after, before, raw, prevRaw) {
  before = before || [];
  if (OBJ[form]) { const o = objectPronoun(form, after, before); if (o) return o; }
  if (form === 'a' || form === 'as') return article(form, after);
  if (form === 'para') return para(after);
  if (form === 'se') return seGloss(after, before, prevRaw);
  if (form === 'até') return ate(after);
  /* `mesmo` AFTER A PRONOUN IS "-self". "a vós mesmos" is "within
     yourselves"; on its own `mesmo` is "even" or "same". */
  if (/^mesm[oa]s?$/.test(form)) {
    const prev = before[before.length - 1];
    const SELF = { vós: 'yourselves', vos: 'yourselves', nós: 'ourselves',
                   si: 'themselves', ti: 'thyself', mim: 'myself', ele: 'himself',
                   ela: 'herself', eles: 'themselves', elas: 'themselves' };
    if (SELF[prev]) return SELF[prev];
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
         resolveSyntax(form, o.after || [], o.before || [], o.raw, o.prevRaw) ||
         resolve(form, o.en);
}

module.exports = { resolve, resolveSyntax, contextual, properName, AMBIGUOUS };
