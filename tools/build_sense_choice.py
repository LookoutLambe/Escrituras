#!/usr/bin/env python3
"""Learn which dictionary sense THIS translation uses, from the corpus itself.

The dictionary lists senses in its own order, and that order is often not the
one the translator chose:

    salir   -> "to leave (verb); to go out (verb); to exit (verb)"
    empezar -> "to start (verb); to begin (verb)"

The corpus says "went out" and "began" -- the SECOND sense in both cases. A
tool that always takes the first sense re-glosses salieron as "they left" and
empezaron as "they started", quietly overwriting the translator's word choice.

So read the choice off the existing corpus: for every token, work out which of
its lemma's senses the current gloss is a form of, tally per lemma, and keep
the dominant one. That is the translator's own vocabulary, learned from their
own work, and it makes a from-scratch regloss reproduce what is already there
instead of regressing it.

Writes tools/spa_sense_choice.json: lemma -> chosen English verb.
"""
import os, re, sys, json
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_lookup as S
import spa_gloss as G
import spa_apply as A

MIN_COUNT = 3        # attested this often, when the dictionary corroborates
MIN_SHARE = 0.55     # and this dominant

# A value the dictionary does NOT list is an extraordinary claim and needs
# extraordinary evidence. The corpus contains 8 tokens of `alcanzar` glossed
# "toed" -- junk from an earlier pass -- and once function words were filtered
# out those 8 were the majority of what remained, so the learner concluded
# alcanzar means "toe". Corroborated values keep the low bar; uncorroborated
# ones must clear this.
UNLISTED_MIN_COUNT = 25
UNLISTED_MIN_SHARE = 0.70


def senses(raw):
    """Every sense the dictionary lists, bare and in order."""
    out = []
    for part in re.split(r';', raw or ''):
        w = re.sub(r'\(.*?\)', '', part).strip().rstrip('.,;')
        if w.lower().startswith('to '):
            w = w[3:].strip()
        if w and len(w) < 30 and not re.search(r'\d', w):
            out.append(w.lower())
    return out


def shapes_of(v):
    """Every English form of a sense, phrasal verbs included."""
    hi = G._head_inflect
    return {v, hi(v, G._third), hi(v, G._past), hi(v, G._parti), hi(v, G._ing)}


PRON = ('i', 'you', 'we', 'they', 'he', 'she', 'it', 'thou', 'ye')
AUX = ('to', 'will', 'would', 'may', 'might', 'should', 'shall', 'do', 'does',
       'did', 'have', 'has', 'had', 'be', 'is', 'are', 'was', 'were', 'been')


def gloss_core(g):
    """The gloss with its pronoun and modal auxiliaries stripped."""
    w = (g or '').lower().replace('-', ' ').strip(' .,;:!?"')
    parts = w.split()
    while parts and parts[0] in PRON:
        parts = parts[1:]
    while parts and parts[0] in AUX:
        parts = parts[1:]
    return ' '.join(parts)


def main():
    """Learn the dominant English verb per Spanish lemma, from the corpus.

    Not restricted to the dictionary's senses. That restriction was the flaw
    in the first version: poder's whole entry is "power (noun)" with no verb
    sense at all, so "could" could never be learned and pudo glossed
    "powered". Reading the corpus directly learns the translator's word
    whether the dictionary lists it or not -- which is what lets the
    hand-written STRONG_PRETERITE and HOMOGRAPHS tables be deleted instead of
    maintained.
    """
    import eng_verbs, spa_conjug, spa_audit
    lex, forms, names = A.load()
    # A learner reading an imperfect corpus will learn its defects. This corpus
    # has ~15,800 drift glosses -- a content word carrying a neighbour's
    # function word -- and without this filter the learner recorded
    # cenir -> "and" and cobrar -> "the", then emitted them as vocabulary and
    # built "anded" and "thes". Never learn from a gloss that is a bare English
    # function word, and never emit one: a Spanish verb does not mean "the".
    FUNCTION = spa_audit.FUNCTION_EN
    tally = defaultdict(Counter)
    for _b, _c, _v, _en, toks in A.walk_verses():
        for sp, gl in toks:
            k = sp.lower().strip(A.STRIP)
            if not k:
                continue
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src:
                continue
            lemma = src.split(':')[1].split('>')[0] if ':' in src else k
            if not lemma.endswith(('ar', 'er', 'ir')):
                continue                 # verbs only
            # and only where the token really IS a verb here. "el poder" is
            # the noun power, 503 tokens of it, and counting those made
            # "power" rival "can" and sank the whole lemma below threshold.
            if spa_conjug.verb_tag(k, lemma) is None:
                continue
            core = gloss_core(gl)
            if not core or len(core) > 24:
                continue
            if all(t in FUNCTION for t in core.split()):
                continue                 # a drift gloss: not evidence
            base = eng_verbs.base_form(core)
            if base and re.fullmatch(r"[a-z][a-z' -]*", base):
                tally[lemma][base] += 1

    chosen, ambiguous = {}, 0
    for lemma, c in tally.items():
        total = sum(c.values())
        v, n = c.most_common(1)[0]
        listed = {eng_verbs.base_form(x) for x in senses(lex.get(lemma) or '')}
        if v in listed:
            floor, share = MIN_COUNT, MIN_SHARE
        else:
            floor, share = UNLISTED_MIN_COUNT, UNLISTED_MIN_SHARE
        if n < floor or n / total < share:
            ambiguous += 1
            continue
        if v in FUNCTION or all(t in FUNCTION for t in v.split()):
            continue                     # never emit a function word as a verb
        # The value must be a real English VERB. Without this the learner
        # emitted caldear -> "chaldea", ceder -> "kedesh" and amasar ->
        # "amasa" (proper names it aligned with), alimentar -> "food" and
        # almacenar -> "storehouses" (nouns), and nacer -> "born", a
        # participle, which then inflected to "borns".
        if not (eng_verbs.known(v) or eng_verbs.known(v.split()[0])):
            continue
        first = (senses(lex.get(lemma) or '') or [None])[0]
        if first and eng_verbs.base_form(first) == v:
            continue                     # sense #1 already gives this
        chosen[lemma] = v

    path = os.path.join(HERE, 'spa_sense_choice.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(chosen, fh, ensure_ascii=False, indent=0, sort_keys=True)
    print("  lemmas with a learned choice: %d" % len(chosen))
    print("  too ambiguous to call       : %d" % ambiguous)
    print()
    for lemma in ('salir', 'empezar', 'poder', 'llegar', 'echar', 'quedar',
                  'conducir', 'caber', 'poner', 'traer', 'tener', 'hacer',
                  'decir', 'ser', 'ir', 'venir', 'ver', 'estar'):
        if lemma in chosen:
            print("   %-10s -> %-12s (dictionary #1: %s)" %
                  (lemma, chosen[lemma], (senses(lex.get(lemma) or '') or ['-'])[0]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
