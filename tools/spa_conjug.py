#!/usr/bin/env python3
"""Spanish conjugation from a real conjugation database, not hand-written rules.

Data: mlconjug3's Spanish tables (Verbiste lineage) -- 9,732 verbs as
root+template over 408 templates, each template giving mood -> tense ->
[(person, ending)].  A form is simply root + ending.

Why this replaced the hand-rolled tables in spa_paradigms.py: those had to
encode every stem-change family, every orthographic repair and every irregular
by hand, and still produced "satisfico" for satisfizo and "duermio" for durmio.
The database has all of it already, including the vosotros column this corpus
needs (-ais/-eis, "haced", "hagais").  spa_paradigms stays as the fallback for
verbs the database does not list.

Compound tenses are skipped: they are auxiliary + participle, which the corpus
writes as two separate interlinear tokens anyway.
"""
import os, json, functools

HERE = os.path.dirname(os.path.abspath(__file__))
PERSONS = ('1s', '2s', '3s', '1p', '2p', '3p')

# Spanish tense name -> our tag. Only the simple tenses.
TENSE_TAG = {
    ('Indicativo', 'Indicativo presente'):                  'pres',
    ('Indicativo', 'Indicativo pretérito imperfecto'):      'impf',
    ('Indicativo', 'Indicativo pretérito perfecto simple'): 'pret',
    ('Indicativo', 'Indicativo futuro'):                    'fut',
    ('Condicional', 'Condicional'):                         'cond',
    ('Subjuntivo', 'Subjuntivo presente'):                  'subj',
    ('Subjuntivo', 'Subjuntivo pretérito imperfecto (1)'):  'subji',
    ('Subjuntivo', 'Subjuntivo pretérito imperfecto (2)'):  'subjs',
    ('Subjuntivo', 'Subjuntivo futuro'):                    'subjf',
}
# the imperative table is 5 slots: tu, usted, nosotros, vosotros, ustedes
IMP_SLOTS = ('2s', '3s', '1p', '2p', '3p')


@functools.lru_cache(maxsize=1)
def load():
    with open(os.path.join(HERE, 'verbs-es.json'), encoding='utf-8') as fh:
        verbs = json.load(fh)
    with open(os.path.join(HERE, 'conjugation-es.json'), encoding='utf-8') as fh:
        tmpl = json.load(fh)
    return verbs, tmpl


def conjugate(lemma):
    """{form: tag} for a verb, or {} if the database does not have it."""
    verbs, tmpl = load()
    ent = verbs.get(lemma)
    if not ent:
        return {}
    root, table = ent['root'], tmpl.get(ent['template'])
    if not table:
        return {}
    out = {}

    def put(form, tag):
        # One spelling can fill several slots of the SAME verb: "sabe" is both
        # 3sg present and an imperative. Keeping whichever the JSON listed first
        # made it an imperative, and the gloss read "you-know" for "knows".
        if not form:
            return
        def rank(t):
            tense, _, person = t.partition('.')
            return (TENSE_RANK.get(tense, 99), PERSON_RANK.get(person, 9))
        old = out.get(form)
        if old is None or rank(tag) < rank(old):
            out[form] = tag

    for mood, tenses in table.items():
        for tense, rows in tenses.items():
            if not rows:
                continue
            tag = TENSE_TAG.get((mood, tense))
            if tag:
                for idx, end in rows:
                    if end is not None and isinstance(idx, int) and idx < 6:
                        put(root + end, '%s.%s' % (tag, PERSONS[idx]))
            elif tense == 'Imperativo':
                for idx, end in rows:
                    if end is not None and isinstance(idx, int) and idx < 5:
                        put(root + end, 'imp.' + IMP_SLOTS[idx])
            elif tense == 'Infinitivo':
                put(root + rows[0][1], 'inf')
            elif tense == 'Gerundio':
                put(root + rows[0][1], 'ger')
            elif tense == 'Participo':
                put(root + rows[0][1], 'part')
    return out


def has(lemma):
    verbs, _ = load()
    return lemma in verbs


def conjugate_any(lemma):
    """Database first, hand-rolled paradigms as the fallback."""
    out = conjugate(lemma)
    if out:
        return out
    import spa_paradigms
    return spa_paradigms.conjugate(lemma)


# When one spelling has several analyses, prefer the commonest reading.
# "se" is 1sg present of saber AND the tu imperative of ser; "sabe" is 3sg
# present AND an imperative. Indicative beats subjunctive beats imperative.
# The imperfect, conditional and subjunctive are syncretic in 1sg/3sg: "era",
# "seria", "tuviera" fill both slots. Narrative prose is overwhelmingly 3rd
# person, and 3s is the safer output anyway because the corpus puts no pronoun
# on it -- choosing 1s invents an "I" that is not in the Spanish.
PERSON_RANK = {'3s': 0, '3p': 1, '1s': 2, '2s': 3, '1p': 4, '2p': 5}

TENSE_RANK = {'pres': 0, 'pret': 1, 'impf': 2, 'fut': 3, 'cond': 4,
              'part': 5, 'ger': 6, 'inf': 7,
              'subj': 8, 'subji': 9, 'subjs': 10, 'subjf': 11, 'imp': 12}


@functools.lru_cache(maxsize=1)
def form_index():
    """{form: [(lemma, tag), ...]} -- every analysis, not just one.

    Keeping only one analysis and picking it by shortest lemma made "se" resolve
    to ser's imperative and gloss as "you-know". The caller usually already
    knows the lemma, so keep them all and let verb_tag() choose.
    """
    verbs, _ = load()
    idx = {}
    for lemma in verbs:
        for form, tag in conjugate(lemma).items():
            idx.setdefault(form, []).append((lemma, tag))
    return idx


def verb_tag(surface, lemma=None):
    """Tense+person tag for a form. Pass the lemma when it is already known."""
    cands = form_index().get(surface.lower())
    if not cands:
        return None
    if lemma:
        lem = lemma.lower()
        same = [c for c in cands if c[0] == lem or c[0] == lem + 'se'
                or c[0].rstrip('se') == lem]
        if same:
            cands = same
    def rank(c):
        tense, _, person = c[1].partition('.')
        return (TENSE_RANK.get(tense, 99), PERSON_RANK.get(person, 9), len(c[0]))
    return min(cands, key=rank)[1]


