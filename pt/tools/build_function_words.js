/**
 * The closed classes — pronouns and contractions — with their English glosses.
 *
 * These are the highest-frequency words in the corpus and none of them were
 * reachable: `do` alone is 14,439 tokens, `da` 9,703, `dos` 6,924. The
 * contraction table has existed since the morphology build; it was simply
 * never wired to a gloss. A contraction glosses as its PARTS, which is what an
 * interlinear needs anyway — do = de + o = "of-the", not one opaque word.
 *
 * The pronoun paradigm is complete here, not just the second person. The
 * treebanks carry the first and third fine; it was only `tu`/`vós` they had
 * nothing for. Keeping the whole set in one place means the archaic forms sit
 * beside the ordinary ones instead of in a special case.
 *
 * Writes tools/por_function.json:  form -> {gloss, kind, parts?}
 *
 * Usage: node tools/build_function_words.js
 */
const fs = require('fs');
const path = require('path');

const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_morph.json'), 'utf8'));
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_dict.json'), 'utf8'));

/* Glosses for the pieces a contraction is made of, and for the pronouns.
   Stated because a bilingual dictionary gives "de -> of, from, by" and an
   interlinear needs ONE word under ONE word. */
const PIECE = {
  'de': 'of', 'em': 'in', 'por': 'by', 'a': 'to', 'para': 'for',
  'o': 'the', 'os': 'the', 'um': 'a', 'uns': 'some',
  'ele': 'him', 'eles': 'them', 'isto': 'this', 'isso': 'that', 'aquilo': 'that',
  'aquele': 'that', 'aqueles': 'those', 'este': 'this', 'esse': 'that', 'outro': 'other',
};

const PRONOUNS = {
  'eu': 'I', 'me': 'me', 'mim': 'me', 'comigo': 'with-me',
  'meu': 'my', 'minha': 'my', 'meus': 'my', 'minhas': 'my',
  /* MODERN ENGLISH IN THE GLOSS, matching the Spanish edition: its source is
     archaic too (vosotros, tú) and it glosses every one of them "you"/"your",
     never thou/thee/thy. The gloss explains the word to a reader; it does not
     imitate the King James. */
  'tu': 'you', 'te': 'you', 'ti': 'you', 'contigo': 'with-you',
  'teu': 'your', 'tua': 'your', 'teus': 'your', 'tuas': 'your',
  'ele': 'he', 'ela': 'she', 'lhe': 'to-him', 'si': 'himself', 'consigo': 'with-him',
  'seu': 'his', 'sua': 'his', 'seus': 'his', 'suas': 'his',
  'nós': 'we', 'nos': 'us', 'conosco': 'with-us', 'connosco': 'with-us',
  'nosso': 'our', 'nossa': 'our', 'nossos': 'our', 'nossas': 'our',
  'vós': 'you', 'vos': 'you', 'convosco': 'with-you',
  'vosso': 'your', 'vossa': 'your', 'vossos': 'your', 'vossas': 'your',
  'eles': 'they', 'elas': 'they', 'lhes': 'to-them',
  'se': 'himself', 'quem': 'who', 'que': 'that', 'qual': 'which',
  'ó': 'O',                       // the vocative particle: "ó Senhor"
  /* THE ARTICLES. `a` fell through to the dictionary and glossed "at" — it is
     the feminine article far more often than anything else, and "a terra"
     is "the earth". Same for o/os/as. */
  'o': 'the', 'a': 'the', 'os': 'the', 'as': 'the',
  'um': 'a', 'uma': 'a', 'uns': 'some', 'umas': 'some'
};

/* FUSED CLITIC PAIRS. Portuguese contracts a dative and an accusative into one
   word — lhe + o = lho, te + o = to, vos + o = vo-lo — and the result is not a
   form any lexicon lists. 245 instances here, and `to` in particular looks
   like an English word leaking into the corpus until you read the verse:
   "e to darei a ti" is "and I will give IT TO THEE". A closed set, so it is
   simply enumerated. */
const FUSED = {
  'lho': 'to-him-it', 'lha': 'to-him-it', 'lhos': 'to-him-them', 'lhas': 'to-him-them',
  'mo': 'to-me-it', 'ma': 'to-me-it', 'mos': 'to-me-them', 'mas': 'to-me-them',
  'to': 'to-you-it', 'ta': 'to-you-it', 'tos': 'to-you-them', 'tas': 'to-you-them',
  'vo-lo': 'to-you-it', 'vo-la': 'to-you-it', 'vo-los': 'to-you-them', 'vo-las': 'to-you-them',
  'no-lo': 'to-us-it', 'no-la': 'to-us-it', 'no-los': 'to-us-them', 'no-las': 'to-us-them',
};

const out = {};
for (const [f, g] of Object.entries(PRONOUNS)) out[f] = { gloss: g, kind: 'pronoun' };
for (const [f, g] of Object.entries(FUSED)) out[f] = { gloss: g, kind: 'fused-clitic' };

let contracted = 0, unglossed = [];
for (const [surface, parts] of Object.entries(M.contractions)) {
  if (out[surface]) continue;                       // a pronoun wins over a contraction reading
  const words = parts.map(([lemma]) => PIECE[lemma] || (D[lemma] && D[lemma][0] && D[lemma][0][0]));
  if (words.some(w => !w)) { unglossed.push(surface + ' = ' + parts.map(p => p[0]).join('+')); continue; }
  out[surface] = { gloss: words.join('-'), kind: 'contraction', parts: parts.map(p => p[0]) };
  contracted++;
}

fs.writeFileSync(path.join(__dirname, 'por_function.json'), JSON.stringify(out, null, 0));
console.log('  pronouns      :', Object.keys(PRONOUNS).length);
console.log('  fused clitics :', Object.keys(FUSED).length);
console.log('  contractions  :', contracted, ' unglossable:', unglossed.length);
if (unglossed.length) console.log('    ' + unglossed.slice(0, 8).join(', '));
console.log('\n  ' + ['do', 'da', 'dos', 'das', 'à', 'às', 'aos', 'no', 'na', 'pelo', 'num', 'dele']
  .map(w => w.padEnd(6) + '-> ' + (out[w] ? out[w].gloss : '(none)')).join('\n  '));
