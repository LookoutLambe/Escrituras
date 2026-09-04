#!/usr/bin/env python3
"""Is this English gloss a plausible rendering of this Spanish word?

The audit's sense test was string intersection against the dictionary's own
sense list, and it failed two ways that between them made it unusable as a
detector -- 11.1% of the whole corpus came back "mismatched", nearly all of it
correct:

    alturas   -> "heights"   senses: altitude, elevation, height   (a PLURAL)
    sinagogas -> "synagogues" senses: synagogue                    (a PLURAL)
    sobre     -> "upon"      senses: about, above, on              (a SYNONYM)

So the report was narrowed instead, to glosses whose leftover is a pronoun, an
auxiliary or a function word. That is why D&C 117:1 audits CLEAN while reading
`negocios -> "marks"` and `Whitney -> "k"`: a gloss stolen from a neighbour is
usually a content word, and the narrowed report drops every one of them.

This module widens the TEST instead, so the report does not have to be narrow.

1. English noun morphology, so a plural is not a mismatch. eng_verbs already
   did this for verbs; nothing did it for nouns.

2. A synonym bridge built from the BILINGUAL DICTIONARY -- never from the
   corpus. Two English words are near-synonyms in this domain when the
   dictionary lists both as senses of one Spanish headword. The bridge is one
   hop and never transitive: "upon" is accepted for `sobre` because some
   headword glosses as both "upon" and "on", and `sobre` glosses as "on".
   Chaining hops would walk from "bank" to "shore" to "coast" and accept
   anything, so it does not chain.

   Deriving this from the corpus instead would be the circularity trap that
   has already cost this project one whole pass: a learner reading an
   imperfect corpus learns its defects. The dictionary is an outside witness.
"""
import os, re, json, functools

HERE = os.path.dirname(os.path.abspath(__file__))
import eng_verbs as EV

# Irregular English plurals that no suffix rule reaches. Small on purpose:
# these are the ones a scripture corpus actually uses.
IRREGULAR = {
    'men': 'man', 'women': 'woman', 'children': 'child', 'oxen': 'ox',
    'feet': 'foot', 'teeth': 'tooth', 'geese': 'goose', 'mice': 'mouse',
    'people': 'person', 'brethren': 'brother', 'brothers': 'brother',
    'lice': 'louse', 'swine': 'swine', 'sheep': 'sheep', 'deer': 'deer',
    'fish': 'fish', 'cattle': 'cattle', 'feet.': 'foot',
}


def singulars(w):
    """Every singular an English plural could be. Never decides, only offers."""
    out = set()
    if not w:
        return out
    if w in IRREGULAR:
        out.add(IRREGULAR[w])
    if len(w) > 3 and w.endswith('ies'):
        out.add(w[:-3] + 'y')
    if len(w) > 3 and w.endswith('ves'):
        out.add(w[:-3] + 'f')
        out.add(w[:-3] + 'fe')
    if len(w) > 3 and w.endswith(('ches', 'shes', 'sses', 'xes', 'zes')):
        out.add(w[:-2])
    if len(w) > 2 and w.endswith('es'):
        out.add(w[:-2])
        out.add(w[:-1])
    if len(w) > 2 and w.endswith('s') and not w.endswith('ss'):
        out.add(w[:-1])
    return {x for x in out if x}


def variants(w):
    """The word, its verb base, and any singular it might be a plural of."""
    w = (w or '').strip().lower()
    if not w:
        return set()
    out = {w, EV.base_form(w)}
    out |= singulars(w)
    for s in list(out):
        out.add(EV.base_form(s))
    return {x for x in out if x}


def spread(text):
    """Every base form in a gloss or a dictionary sense string."""
    out = set()
    for part in re.split(r'[;,/]', text or ''):
        p = re.sub(r'\(.*?\)', '', part).strip().lower().rstrip('.')
        if p.startswith('to '):
            p = p[3:].strip()
        if not p or len(p) > 40:
            continue
        out |= variants(p)
        for tok in p.replace('-', ' ').split():
            out |= variants(tok)
    return {x for x in out if x}


@functools.lru_cache(maxsize=1)
def _bridge():
    """english word -> the set of english words it shares a headword with.

    Built from spa_eng_dict.json only. 54,749 headwords; a sense list of more
    than 8 words is dropped, because a headword that glosses as a dozen things
    is a hub that would link everything to everything.
    """
    root = os.path.dirname(HERE)
    raw = json.load(open(os.path.join(root, 'spa_eng_dict.json'), encoding='utf-8'))
    arr = json.loads(raw) if isinstance(raw, str) else raw
    bridge = {}
    for e in arr:
        t = e.get('translation')
        if not t:
            continue
        senses = set()
        for part in re.split(r'[;,]', t):
            p = re.sub(r'\(.*?\)', '', part).strip().lower().rstrip('.')
            if p.startswith('to '):
                p = p[3:].strip()
            if p and ' ' not in p and len(p) < 25:
                senses.add(p)
        if not 2 <= len(senses) <= 8:
            continue
        for s in senses:
            bridge.setdefault(s, set()).update(senses - {s})
    return bridge


def renders(gloss, sense_text):
    """Could `gloss` be a rendering of a word whose dictionary entry is
    `sense_text`?  Direct match first, then one hop through the bridge."""
    g = spread(gloss)
    s = spread(sense_text)
    if not g or not s:
        return False
    if g & s:
        return True
    b = _bridge()
    for w in g:
        near = b.get(w)
        if near and (near & s):
            return True
    return False


if __name__ == '__main__':
    import sys
    for pair in sys.argv[1:]:
        gl, _, sn = pair.partition('=')
        print('%-18s vs %-30s -> %s' % (gl, sn, renders(gl, sn)))
