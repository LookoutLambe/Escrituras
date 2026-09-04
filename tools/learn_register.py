#!/usr/bin/env python3
"""Learn the BIBLICAL REGISTER the modern dictionary does not carry.

The bilingual dictionary is modern peninsular Spanish; the corpus is
Reina-Valera and its English partner is the KJV. So the dictionary has no
"upon" for `sobre`, no "Jehovah" for `Jehová`, no "begat", "wilderness",
"covenant" or "wo". 73,460 tokens audit as "the gloss is not a sense of this
word", and the great majority of them are this -- correct glosses in a
register the dictionary was never going to list.

Those gaps used to be closed by hand, in spa_supplement.json. That is the
practice this project has been trying to stop: a hand table does not
generalise, it goes stale, and it encodes one person's guess as fact.

This learns them instead, and the whole design is about NOT letting the corpus
validate itself -- the trap that cost this project a whole 11,321-token pass.
A pairing is admitted only on TWO witnesses:

  1. The corpus proposes it. `word -> gloss` must be that word's dominant
     reading, over a floor of occurrences, with a real majority share.

  2. The CANON ENGLISH confirms it. The gloss's own word must actually appear
     in the printed English of the verses where the pairing occurs -- and by
     more than chance. That is the outside witness. english_verses.js is not
     the gloss column; it is the published translation, and it did not come
     from any pass this toolchain ever ran.

Witness 2 is document-frequency weighted, because presence alone proves
nothing for a common word: "pass" is in every "it came to pass" and would
confirm any gloss at all. A pairing has to beat the rate at which its English
word shows up in verses generally, by a wide margin.

Function-word glosses are refused outright unless the Spanish word is itself a
function word, because "content word glossed as a preposition" is the exact
signature of the alignment drift this file is meant to help find.

    python3 tools/learn_register.py            # report only
    python3 tools/learn_register.py --write    # write spa_register.json
"""
import os, sys, re, json, math, unicodedata
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_apply as A
import spa_lookup as S
import spa_audit as AU
import spa_morph as M
import eng_sense as ES

OUT = os.path.join(HERE, 'spa_register.json')

MIN_COUNT = 8         # a pairing must occur this many times
MIN_SHARE = 0.60      # ...and be this much of the word's readings
MIN_WITNESS = 0.75    # ...and be confirmed in this share of those verses
MIN_LIFT = 2.0        # ...at this multiple of the word's background rate


def _fold(w):
    """Strip accents AND the regular Spanish/English name correspondences.

    Sion/Zion, Josue/Joshua, Jeremias/Jeremiah, Ezequias/Hezekiah: the two
    traditions spell one name differently in ways that are systematic, not
    random. Folding only the accents refused Sion outright, because 'sion' and
    'zion' share no four-letter prefix and 'z' is not in 'sion' at all.
    """
    w = (unicodedata.normalize('NFD', w or '')
         .encode('ascii', 'ignore').decode('ascii').lower())
    for a, b in (('qu', 'k'), ('ph', 'f'), ('th', 't'), ('ll', 'l'),
                 ('z', 's'), ('j', 'h'), ('x', 's'), ('v', 'b'),
                 ('y', 'i'), ('ck', 'k'), ('c', 'k'), ('gh', 'g')):
        w = w.replace(a, b)
    return w


def _same_name(k, gloss_word):
    """Is the English name simply this Spanish name spelled English?

    Moises/Moses, Juda/Judah, Josue/Joshua, Ezequias/Hezekiah -- the two
    spellings of one name share a stem, and a common noun glossed as a name
    (benditas -> "abraham") does not. Accent-folded, because Juda.startswith
    ("juda") is False in Python and that alone would have thrown away every
    accented name in the Old Testament.
    """
    a, b = _fold(k), _fold(gloss_word)
    if not a or not b:
        return False
    if a[:4] == b[:4] or a.startswith(b[:3]) or b.startswith(a[:3]):
        return True
    # Ezequias/Hezekiah, Josue/Joshua: same letters in order, one short stem
    common = 0
    i = 0
    for ch in b:
        j = a.find(ch, i)
        if j >= 0:
            common += 1
            i = j + 1
    return common >= max(4, int(0.7 * len(b)))


SPANISH_FUNCTION_POS = ('ADP', 'SCONJ', 'CCONJ', 'DET', 'PRON', 'AUX')


def is_function_word(k, lex, forms, names):
    """Positive evidence only. Absence of a tag proves nothing."""
    if ' ' in k:
        return True                     # "para que", "sino que", "despues que"
    if M.pos(k) in SPANISH_FUNCTION_POS:
        return True
    if k.endswith('mente'):
        return False                    # an adverb of manner is a content word
    if k.endswith(('ar', 'er', 'ir')) and len(k) > 3:
        return False                    # an infinitive is a content word
    src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
    if src and str(src).startswith(('verb', 'conj')):
        return False
    if tr:
        senses = [w for w in ES.spread(tr) if w]
        if senses and not any(w in AU.FUNCTION_EN for w in senses):
            return False
    return False


def _confirmed(tok, english_words_in_verse):
    if any(b in english_words_in_verse for b in ES.variants(tok)):
        return True
    near = ES._bridge().get(tok)
    if near:
        for w in near:
            if any(b in english_words_in_verse for b in ES.variants(w)):
                return True
    return False


def _words(text):
    return [w for w in re.findall(r"[A-Za-z']+", (text or '').lower()) if w]


def learn():
    lex, forms, names = A.load()
    pair = Counter()               # (spanish, gloss) -> n
    word_total = Counter()         # spanish -> n
    witness = Counter()            # (spanish, gloss) -> verses whose EN carries it
    en_doc = Counter()             # english word -> verses containing it
    verses = 0

    for book, ch, v, en, toks in A.walk_verses():
        verses += 1
        enw = set(_words(en))
        for w in enw:
            en_doc[w] += 1
            for b in ES.variants(w):
                if b != w:
                    en_doc[b] += 1
        for sp, gl in toks:
            k = sp.lower().strip(A.STRIP)
            g = gl.strip('.,;:!?¿¡"').lower()
            if not k or not g or g in AU.STOPGLOSS:
                continue
            # "mal,y" / "mi,y" / "el,y" -- a comma swallowed into the token.
            # That is a tokenisation defect and must never become a lexicon
            # entry; it is reported by --tokens instead.
            if re.search(r'[,;:][^\s]', k):
                continue
            word_total[k] += 1
            pair[(k, g)] += 1
            if not en:
                continue
            # the gloss's own content words, minus the person prefix the
            # toolchain itself adds -- those are ours, not the canon's
            core = [t for t in g.replace('-', ' ').split()
                    if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it')]
            # Confirmed if the canon carries the gloss OR a one-hop synonym of
            # it. `sobre -> "upon"` is right in all 4,113 places it occurs, but
            # the canon writes "on" or "over" in a third of them, which pushed
            # the literal-match rate to 0.67 and threw the pairing away.
            if core and all(_confirmed(t, enw) for t in core):
                witness[(k, g)] += 1
    return pair, word_total, witness, en_doc, verses, lex, forms, names


def propose():
    pair, word_total, witness, en_doc, verses, lex, forms, names = learn()
    out, rejected = {}, Counter()
    for (k, g), n in pair.most_common():
        if n < MIN_COUNT:
            continue
        if n / word_total[k] < MIN_SHARE:
            rejected['not dominant'] += 1
            continue
        # Already handled: the dictionary renders it, so nothing to teach.
        src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
        if tr and ES.renders(g, tr):
            continue
        core = [t for t in g.replace('-', ' ').split()
                if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it')]
        if not core:
            rejected['bare pronoun'] += 1
            continue
        # A CONTENT word glossed as a function word IS the drift signature --
        # but a Spanish preposition or conjunction glossed as an English one is
        # simply correct. Asking whether the SPANISH word was in an ENGLISH
        # function-word list refused every real preposition, so the next
        # version asked M.pos() instead -- and the tagger returns None for a
        # great many words, so `sanar -> "to"`, `torta -> "a"`, `secar -> "up"`
        # and `apartate -> "from"` all walked straight in. An absent tag is not
        # evidence of anything.
        #
        # So this now demands POSITIVE evidence that the Spanish word is a
        # function word, and refuses by default. Getting it wrong in that
        # direction costs a suppressed true positive; getting it wrong the
        # other way teaches the tool that a verb means "to".
        PARTICLE_EN = {'up', 'down', 'out', 'off', 'away', 'back', 'forth',
                       'again', 'together', 'along', 'across', 'apart'}
        if all(t in (AU.FUNCTION_EN | PARTICLE_EN) for t in core):
            if not is_function_word(k, lex, forms, names):
                rejected['content word glossed as function word'] += 1
                continue

        # A common noun glossed as a proper name is drift, not register:
        # `benditas -> "abraham"` reached share 0.67 and witness 1.00, because
        # Abraham really is in every one of those verses -- being blessed.
        gw = g.replace('-', ' ').split()[0]
        if gw in AU._known_names() and not _same_name(k, gw):
            rejected['common word glossed as a name'] += 1
            continue
        w = witness[(k, g)] / n if n else 0
        if w < MIN_WITNESS:
            rejected['canon does not confirm'] += 1
            continue
        # Document-frequency lift: beat the background rate of this English
        # word, or "pass" would confirm every gloss in the book.
        base = max(en_doc.get(core[0], 0), 1) / verses
        lift = w / base if base else 999
        if lift < MIN_LIFT:
            rejected['no lift over background'] += 1
            continue
        out[k] = {'gloss': g, 'n': n, 'share': round(n / word_total[k], 3),
                  'witness': round(w, 3), 'lift': round(min(lift, 999), 1)}
    return out, rejected


def main(argv):
    out, rejected = propose()
    print('learned %d register pairings\n' % len(out))
    print('%-22s %-24s %6s %6s %7s %7s' % ('SPANISH', 'GLOSS', 'n', 'share', 'witness', 'lift'))
    for k, d in sorted(out.items(), key=lambda kv: -kv[1]['n'])[:45]:
        print('%-22s %-24s %6d %6.2f %7.2f %7.1f'
              % (k, d['gloss'], d['n'], d['share'], d['witness'], d['lift']))
    print('\nrefused:', dict(rejected))
    if '--write' in argv:
        with open(OUT, 'w', encoding='utf-8') as fh:
            json.dump(out, fh, ensure_ascii=False, indent=0, sort_keys=True)
        print('\nwrote %s' % OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
