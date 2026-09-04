#!/usr/bin/env python3
"""Learn the multiword units this interlinear treats as single tokens.

Some Spanish phrases are one English word and must be one interlinear token:
"he aqui" is "behold", "por tanto" is "therefore", "a causa de" is "because
of". Split across two tokens they either double a word or lose one -- "no
podeis" split gives either "not" + "you-cannot" (the negative twice) or "not"
+ "you-can" (English "cannot" is a single word).

The corpus already writes 83 such phrases as single tokens, so the inventory
does not need to be hand-written: read it off the data, take each unit's
dominant gloss, and then merge every place the SAME phrase is still sitting as
separate adjacent tokens. That is what makes it consistent rather than a
one-off fix for whichever phrase was noticed.

Writes tools/spa_units.json: "spanish phrase" -> gloss.
"""
import os, re, sys, json
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_apply as A

MIN_COUNT = 4
MIN_SHARE = 0.60


def main():
    units = defaultdict(Counter)
    for _b, _c, _v, _en, toks in A.walk_verses():
        for sp, g in toks:
            s = sp.strip(A.STRIP)
            if ' ' in s and len(s) < 40:
                units[s.lower()][g.strip('.,;:!?')] += 1

    out = {}
    for phrase, c in units.items():
        total = sum(c.values())
        gloss, n = c.most_common(1)[0]
        if total >= MIN_COUNT and n / total >= MIN_SHARE and gloss:
            out[phrase] = gloss

    # negated poder is a unit too: English "cannot" is one word. Generated
    # from the paradigm rather than listed, so every tense is covered.
    import spa_conjug as C
    PRON = {'1s': 'I', '2s': 'you', '1p': 'we', '2p': 'you', '3p': 'they', '3s': ''}
    for form, tags in C.form_index().items():
        for lemma, tag in tags:
            if lemma != 'poder' or '.' not in tag:
                continue
            tense, person = tag.split('.')
            stem = {'pres': 'cannot', 'imp': 'cannot', 'pret': 'could-not',
                    'impf': 'could-not', 'cond': 'could-not',
                    'fut': 'will-not-be-able'}.get(tense)
            if not stem:
                continue
            p = PRON.get(person, '')
            out.setdefault('no ' + form, (p + '-' if p else '') + stem)

    path = os.path.join(HERE, 'spa_units.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=0, sort_keys=True)
    print("  multiword units learned: %d" % len(out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
