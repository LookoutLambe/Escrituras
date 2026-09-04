#!/usr/bin/env python3
"""Choose each word's English sense by what the CANON attests, corpus-wide.

The dictionary is contemporary Spanish and orders its senses accordingly, so
sense #1 is often the modern one: medio is "medium" before "midst", grande is
"big" before "great", carne is "meat" before "flesh", puerta is "door" before
"gate".

The fix is not a hand-written scriptural word list. For every Spanish lemma,
take every sense the dictionary offers, and count -- across ALL verses that
contain the lemma -- how often each sense appears in that verse's printed
English. The sense the canon actually uses wins.

Counting corpus-wide is what makes this safe. A per-verse test ("does any
sense of this word appear in THIS verse?") was tried first and proposed 47,346
changes including midst -> "medium", great -> "big", flesh -> "meat" and
gate -> "door", because in a long verse some unrelated sense turns up by
chance. Aggregated over the whole canon that noise cancels and the real
preference shows: midst 673 against medium 0.

Writes tools/spa_canon_sense.json: lemma -> English sense.
"""
import os, re, sys, json
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_lookup as S
import spa_apply as A
import eng_verbs as EV

MIN_HITS = 5          # the winning sense must be attested this often
MIN_MARGIN = 1.5      # and beat the runner-up by this factor


def senses(raw):
    out = []
    for part in re.split(r'[;,]', raw or ''):
        w = re.sub(r'\(.*?\)', '', part).strip().lower().rstrip('.')
        if w.startswith('to '):
            w = w[3:].strip()
        if w and 2 < len(w) < 24 and not re.search(r'\d', w):
            out.append(w)
    seen, uniq = set(), []
    for w in out:
        if w not in seen:
            seen.add(w)
            uniq.append(w)
    return uniq


def forms_of(w):
    stem = w.rstrip('s')
    return {w, w + 's', w + 'es', stem, stem + 's', stem + 'es', stem + 'ed',
            stem + 'ing', stem + 'eth', stem + 'est',
            EV.third(w), EV.past(w), EV.participle(w), EV.ing(w)}


def main():
    lex, forms, names = A.load()
    tally = defaultdict(Counter)
    seen = Counter()
    for _b, _c, _v, en, toks in A.walk_verses():
        if not en:
            continue
        words = set(re.findall(r"[a-z]+", en.lower()))
        lemmas = set()
        for sp, _gl in toks:
            k = sp.lower().strip(A.STRIP)
            if not k or ' ' in k:
                continue
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src or not tr or src == 'name':
                continue
            lemma = src.split(':')[1].split('>')[0] if ':' in src else k
            lemmas.add((lemma, tr))
        for lemma, tr in lemmas:
            seen[lemma] += 1
            for cand in senses(tr):
                if forms_of(cand) & words:
                    tally[lemma][cand] += 1

    chosen = {}
    for lemma, c in tally.items():
        ranked = c.most_common()
        top, n = ranked[0]
        runner = ranked[1][1] if len(ranked) > 1 else 0
        if n < MIN_HITS or (runner and n < runner * MIN_MARGIN):
            continue
        first = (senses(lex.get(lemma) or '') or [None])[0]
        if top == first:
            continue                       # sense #1 already gives this
        chosen[lemma] = top

    path = os.path.join(HERE, 'spa_canon_sense.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(chosen, fh, ensure_ascii=False, indent=0, sort_keys=True)
    print("  lemmas whose canon sense differs from sense #1: %d" % len(chosen))
    print()
    for lemma in ('medio', 'grande', 'carne', 'puerta', 'padre', 'antes',
                  'mandar', 'llamar', 'decir', 'ver', 'tomar', 'malo',
                  'heredad', 'ira', 'ejercito', 'ciudad'):
        if lemma in chosen:
            print("   %-10s -> %-12s (dictionary #1: %s, attested %d verses)" %
                  (lemma, chosen[lemma],
                   (senses(lex.get(lemma) or '') or ['-'])[0],
                   tally[lemma][chosen[lemma]]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
