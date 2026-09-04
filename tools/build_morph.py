#!/usr/bin/env python3
"""Build a Spanish morphological lexicon from the UD treebanks.

Replaces hand-written grammar. Until now the tool carried a typed-out list of
determiners, one of prepositions, one of reflexive clitics, and hand rules for
noun plurals and gender -- each of them partial, and each a place to be wrong.
The Universal Dependencies Spanish treebanks (AnCora + GSD) tag every token of
real Spanish with its lemma, part of speech and full features (Gender, Number,
Person, Tense, Mood), so the closed classes and the nominal morphology can be
read off actual data instead of guessed.

Writes tools/spa_morph.json:
    forms   form -> [[lemma, upos, feats, count], ...]  most frequent first
    closed  upos -> [forms]   for DET, ADP, PRON, CCONJ, SCONJ, AUX
    reflex  the reflexive clitics, tagged Reflex=Yes
"""
import os, sys, json, glob
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CLOSED = ('DET', 'ADP', 'PRON', 'CCONJ', 'SCONJ', 'AUX', 'NUM')


def read_conllu(path):
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            c = line.split('\t')
            if len(c) < 6 or '-' in c[0] or '.' in c[0]:
                continue           # skip multiword ranges and empty nodes
            yield c[1], c[2], c[3], c[5]      # form, lemma, upos, feats


def main():
    files = sorted(glob.glob(os.path.join(HERE, '*.conllu')))
    if not files:
        print("  no .conllu files in tools/ -- download the UD treebanks first")
        return 1
    analyses = defaultdict(Counter)
    closed = defaultdict(Counter)
    reflex = Counter()
    total = 0
    for path in files:
        for form, lemma, upos, feats in read_conllu(path):
            total += 1
            f = form.lower()
            analyses[f][(lemma.lower(), upos, feats)] += 1
            if upos in CLOSED:
                closed[upos][f] += 1
            if 'Reflex=Yes' in feats:
                reflex[f] += 1

    out = {
        'forms': {f: [[l, p, ft, n] for (l, p, ft), n in c.most_common(4)]
                  for f, c in analyses.items()},
        # a closed-class member must be dominant for that form, not incidental:
        # "la" is a DET 30k times and a PRON a few hundred, both real; but a
        # noun that appears once as a stray DET tag should not join the set.
        'closed': {p: sorted(f for f, n in c.items()
                             if n >= 3 and n >= 0.30 * sum(
                                 x for (_l, _p, _ft), x in analyses[f].items()))
                   for p, c in closed.items()},
        'reflex': sorted(f for f, n in reflex.items() if n >= 3),
    }
    with open(os.path.join(HERE, 'spa_morph.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False)
    print("  treebank tokens read : %d  (%d files)" % (total, len(files)))
    print("  distinct forms       : %d" % len(out['forms']))
    for p in CLOSED:
        print("    %-6s %d forms" % (p, len(out['closed'].get(p, []))))
    print("  reflexive clitics    : %s" % ', '.join(out['reflex']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
