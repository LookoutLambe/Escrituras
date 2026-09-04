#!/usr/bin/env python3
"""English verb morphology from a real lexicon, not a hand-written table.

Data: Pattern's en-verbs.txt (CLiPS, UPenn XTAG lineage) -- ~8,500 verbs with
their full conjugation. Columns used:

    0  infinitive        drive
    3  3rd singular      drives
    5  present participle driving
    10 past              drove
    11 past participle   driven

An empty cell means the verb is regular and the form is derived by rule.

Replaces the hand-typed IRREGULAR dict, which had ~40 verbs and silently
produced "drived" for conducir, "cry outed" for clamar, and "receivs" for
recibir. Anything the lexicon does not know still falls back to the spelling
rules below, so coverage degrades gracefully instead of breaking.
"""
import os, re, functools

HERE = os.path.dirname(os.path.abspath(__file__))
THIRD, ING, PAST, PARTICIPLE = 3, 5, 10, 11
# person-specific present/past columns (be: am/are/is/are, was/were/was/were)
PERSON_COLS = (1, 2, 4, 6, 7, 8, 9)


@functools.lru_cache(maxsize=1)
def _table():
    """{infinitive: {form_name: form}} for every verb the lexicon lists."""
    path = os.path.join(HERE, 'en-verbs.txt')
    out = {}
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                if line.startswith(';;;') or not line.strip():
                    continue
                c = line.rstrip('\n').split(',')
                if len(c) <= PARTICIPLE or not c[0]:
                    continue
                inf = c[0].strip().lower()
                if not inf or ' ' in inf:
                    continue
                out.setdefault(inf, {
                    'others': [c[i].strip().lower() for i in PERSON_COLS
                               if i < len(c) and c[i].strip()],
                    'third': c[THIRD].strip().lower() or None,
                    'ing':   c[ING].strip().lower() or None,
                    'past':  c[PAST].strip().lower() or None,
                    'part':  c[PARTICIPLE].strip().lower() or None,
                })
    except OSError:
        pass
    return out


def lookup(verb, form):
    """An irregular form from the lexicon, or None when it is regular."""
    e = _table().get((verb or '').lower())
    return e.get(form) if e else None


# ── regular spelling rules, the fallback ────────────────────────────────────
_VOWEL = 'aeiou'

def regular_third(v):
    if re.search(r'(s|sh|ch|x|z|o)$', v):
        return v + 'es'
    if re.search(r'[^aeiou]y$', v):
        return v[:-1] + 'ies'
    return v + 's'


def regular_past(v):
    if v.endswith('e'):
        return v + 'd'
    if re.search(r'[^aeiou]y$', v):
        return v[:-1] + 'ied'
    return v + 'ed'


def regular_ing(v):
    if v.endswith('ie'):
        return v[:-2] + 'ying'          # die -> dying
    if v.endswith('e') and not v.endswith(('ee', 'oe', 'ye')):
        return v[:-1] + 'ing'
    return v + 'ing'


def third(v):
    return lookup(v, 'third') or regular_third(v)


def past(v):
    return lookup(v, 'past') or regular_past(v)


def participle(v):
    return lookup(v, 'part') or lookup(v, 'past') or regular_past(v)


def ing(v):
    return lookup(v, 'ing') or regular_ing(v)


def known(v):
    return (v or '').lower() in _table()


@functools.lru_cache(maxsize=1)
def _reverse():
    """{inflected form: infinitive} across the whole lexicon."""
    # Inflected forms are indexed FIRST, infinitives second. "saw" is both the
    # past of see and the infinitive of to saw; when un-inflecting a gloss the
    # inflection is the reading wanted, and indexing infinitives first left
    # ver's 851 "saw" glosses counted as a separate verb from its 1,222 "see".
    # Same for "found" (find) and "fell" (fall).
    rev = {}
    for inf, e in _table().items():
        for f in (e.get('past'), e.get('part'), e.get('third'), e.get('ing')):
            if f:
                rev.setdefault(f, inf)
        for f in e.get('others') or ():
            rev.setdefault(f, inf)
    for inf, e in _table().items():
        rev.setdefault(inf, inf)
        for f in (regular_third(inf), regular_past(inf), regular_ing(inf)):
            rev.setdefault(f, inf)
    return rev


def base_form(word):
    """Un-inflect an English verb: "said"/"says"/"saying" -> "say".

    Lets the corpus learner count every inflection of a gloss toward the same
    English verb, so the dominant choice per Spanish lemma is visible.
    """
    w = (word or '').lower().strip()
    if not w:
        return ''
    head, _, rest = w.partition(' ')
    inf = _reverse().get(head)
    if inf is None:
        for suf, cut in (('ies', 3), ('es', 2), ('s', 1), ('ing', 3), ('ed', 2)):
            if head.endswith(suf) and len(head) - cut >= 2:
                stem = head[:-cut]
                for cand in (stem, stem + 'e', stem + 'y'):
                    if cand in _table():
                        inf = cand
                        break
                if inf:
                    break
    inf = inf or head
    return (inf + ' ' + rest).strip() if rest else inf
