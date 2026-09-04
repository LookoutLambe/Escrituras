#!/usr/bin/env python3
"""Loader for the UD-derived Spanish morphology (built by build_morph.py).

This is where the tool's grammar now comes from: 925,993 tagged tokens of real
Spanish, not hand-typed lists. It supplies part of speech, gender, number and
person for 62,987 forms, plus the closed classes (determiners, prepositions,
pronouns) that the context rules key on.

One deliberate supplement. The UD treebanks are modern journalistic Spanish and
use `ustedes`; this corpus is Reina-Valera and uses `vosotros` -- 2,447
vosotros, 3,360 os, 5,702 -ais/-eis verbs, zero ustedes. The vosotros forms are
in the treebank but fall under the frequency threshold for the closed-class
sets, so they are added back here.
"""
import os, json, functools

HERE = os.path.dirname(os.path.abspath(__file__))

# BOTH second-person-plural registers are carried, so the tool is not tied to
# one dialect:
#   vosotros -- peninsular / Reina-Valera, what THIS corpus uses (2,447
#     vosotros, 3,360 os, 5,702 -ais/-eis verbs, zero ustedes). Present in the
#     treebank but below the closed-class frequency threshold.
#   ustedes  -- Latin American, which takes 3rd-plural verb agreement.
VOSOTROS_PRON = {'os', 'vosotros', 'vosotras'}
VOSOTROS_POSS = {'vuestro', 'vuestra', 'vuestros', 'vuestras'}
USTEDES_PRON = {'usted', 'ustedes'}
USTEDES_POSS = {'suyo', 'suya', 'suyos', 'suyas'}

# which verb person each 2pl register agrees with
REGISTER_PERSON = {'vosotros': '2p', 'ustedes': '3p'}


@functools.lru_cache(maxsize=1)
def _data():
    path = os.path.join(HERE, 'spa_morph.json')
    if not os.path.exists(path):
        return {'forms': {}, 'closed': {}, 'reflex': []}
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


@functools.lru_cache(maxsize=1)
def determiners():
    """Everything that can open a noun phrase, possessives included."""
    d = set(_data()['closed'].get('DET', []))
    d |= set(_data()['closed'].get('NUM', []))
    d |= VOSOTROS_POSS | USTEDES_POSS
    for form, an in _data()['forms'].items():
        for lemma, upos, feats, _n in an:
            if upos == 'DET' and 'Poss=Yes' in feats:
                d.add(form)
    return d


@functools.lru_cache(maxsize=1)
def prepositions():
    return set(_data()['closed'].get('ADP', []))


@functools.lru_cache(maxsize=1)
def reflexives():
    return set(_data()['reflex']) | VOSOTROS_PRON


@functools.lru_cache(maxsize=1)
def pronouns():
    return set(_data()['closed'].get('PRON', [])) | VOSOTROS_PRON | USTEDES_PRON


def analyses(form):
    """[(lemma, upos, feats, count)] for a surface form, commonest first."""
    return _data()['forms'].get((form or '').lower(), [])


def pos(form):
    """Dominant part of speech, or None when the form is unknown."""
    a = analyses(form)
    return a[0][1] if a else None


def feats(form):
    a = analyses(form)
    return a[0][2] if a else ''


def second_plural_register(form):
    """'vosotros' or 'ustedes' for a 2pl pronoun, else None."""
    f = (form or '').lower()
    if f in VOSOTROS_PRON or f in VOSOTROS_POSS:
        return 'vosotros'
    if f in USTEDES_PRON or f in USTEDES_POSS:
        return 'ustedes'
    return None


def is_possessive(form):
    for _l, upos, ft, _n in analyses(form):
        if 'Poss=Yes' in ft:
            return True
    return (form or '').lower() in (VOSOTROS_POSS | USTEDES_POSS)


def number(form):
    """'Sing', 'Plur' or None, from the treebank features."""
    ft = feats(form)
    for k in ('Number=Sing', 'Number=Plur'):
        if k in ft:
            return k.split('=')[1]
    return None
