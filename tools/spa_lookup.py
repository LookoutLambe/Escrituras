#!/usr/bin/env python3
"""
spa_lookup — Spanish surface form -> English gloss candidates.

Two data sources, both already in this project:

  spa_eng_dict.json           54,749 bilingual headwords with part-of-speech,
                              shipped with the app. It is double-encoded: a
                              JSON *string* containing the JSON array.
  tools/lemmatization-es.txt  497,560 form->lemma pairs
                              (michmech/lemmatization-lists, CC-BY-SA),
                              tab separated as "lemma<TAB>form".

Why both: the dictionary is lemmatised (infinitives, singulars) while the
corpus is inflected. On its own the dictionary matched 69.2% of tokens but only
21.5% of word TYPES — "recibe", "recibieron" and "recibiendo" all miss while
"recibir" hits. Folding surface forms back to their lemma is what closes it.

  python3 tools/spa_lookup.py recibieron predicaron impuro atardecer
  python3 tools/spa_lookup.py --coverage        # measure against verses/*.js
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spa_gloss import gloss as _shape
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_lexicon():
    raw = json.load(open(os.path.join(ROOT, 'spa_eng_dict.json'), encoding='utf-8'))
    arr = json.loads(raw) if isinstance(raw, str) else raw
    lex = {}
    for e in arr:
        w, t = e.get('word'), e.get('translation')
        if not w or not t:
            continue
        w = w.lower().strip()
        lex.setdefault(w, t)
    return lex

_SUP = None
def load_supplement():
    """Entries I add by hand when the word lists cannot supply them. The tool
    is meant to serve the work, so a known gap gets filled here rather than
    reported as a miss forever."""
    global _SUP
    if _SUP is None:
        path = os.path.join(ROOT, 'tools', 'spa_supplement.json')
        _SUP = {k: v for k, v in json.load(open(path, encoding='utf-8')).items()
                if not k.startswith('_')}
    return _SUP

def load_lemmas():
    """form -> {lemma, ...}. The file is 'lemma<TAB>form', one per line."""
    forms = {}
    path = os.path.join(ROOT, 'tools', 'lemmatization-es.txt')
    with open(path, encoding='utf-8-sig') as fh:
        for line in fh:
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 2:
                continue
            lemma, form = parts[0].strip().lower(), parts[1].strip().lower()
            if form:
                forms.setdefault(form, set()).add(lemma)
    return forms


# ─────────────────────────────────────────────────────────────────────────────
# MORPHOLOGY THE LOOKUP TABLES DO NOT COVER.
# The lemma list is a word list, not a grammar: it misses enclitic pronouns
# ("decirle"), many participles, and anything it simply never recorded. Rather
# than report a miss, generate the candidate lemmas Spanish morphology allows
# and try each against the dictionary.
# ─────────────────────────────────────────────────────────────────────────────
ENCLITICS = ('melo','mela','selo','sela','noslo','nosla','telo','tela',
             'me','te','se','lo','la','le','nos','os','los','las','les')

VERB_ENDINGS = [
    # present
    'o','as','a','amos','áis','an','es','e','emos','éis','en','imos','ís',
    # preterite
    'é','aste','ó','asteis','aron','í','iste','ió','isteis','ieron',
    # imperfect
    'aba','abas','ábamos','abais','aban','ía','ías','íamos','íais','ían',
    # future / conditional (built on the infinitive, so strip to it)
    'aré','arás','ará','aremos','aréis','arán','eré','erá','erán','iré','irá','irán',
    'aría','arías','aríamos','arían','ería','erían','iría','irían',
    # subjunctive
    'ara','aras','áramos','aran','ase','ases','ásemos','asen',
    'iera','ieras','iéramos','ieran','iese','iesen','are','aren',
    # non-finite
    'ando','iendo','yendo','ado','ada','ados','adas','ido','ida','idos','idas',
    # imperative plural
    'ad','ed','id',
]

def _strip_accents(w):
    import unicodedata as _u
    return ''.join(c for c in _u.normalize('NFD', w) if _u.category(c) != 'Mn')

def morph_candidates(w):
    """Candidate lemmas for a surface form, in order of confidence."""
    out = []
    def add(x):
        if x and len(x) > 2 and x not in out:
            out.append(x)

    # enclitic pronouns: decirle -> decir, levantaos -> levantar
    for enc in ENCLITICS:
        if w.endswith(enc) and len(w) - len(enc) >= 3:
            stem = w[:-len(enc)]
            add(stem)
            add(_strip_accents(stem))
            for inf in ('ar', 'er', 'ir'):
                if stem.endswith(inf):
                    add(stem)

    # plurals
    if w.endswith('ces'):  add(w[:-3] + 'z')      # veces -> vez
    if w.endswith('es'):   add(w[:-2])            # mujeres -> mujer
    if w.endswith('s'):    add(w[:-1])            # casas -> casa

    # adjective / participle gender
    for a, b in (('a','o'), ('as','os'), ('os','o'), ('as','o')):
        if w.endswith(a): add(w[:-len(a)] + b)

    # adverbs
    if w.endswith('mente'):
        add(w[:-5]); add(w[:-5] + 'o')            # realmente -> real

    # verb forms -> the three infinitives
    for end in sorted(VERB_ENDINGS, key=len, reverse=True):
        if w.endswith(end) and len(w) - len(end) >= 2:
            stem = w[:-len(end)]
            for inf in ('ar', 'er', 'ir'):
                add(stem + inf)
            add(_strip_accents(stem) + 'ar')
            break

    add(_strip_accents(w))
    return out

# Spanish->English name spelling, the regular correspondences. Nefi is Nephi
# because Spanish writes /f/ where English keeps the Greek ph.
NAME_RULES = [
    ('ph','f'), ('th','t'), ('ch','qu'), ('k','c'), ('y','i'), ('h',''),
]


_LEMMA_SET = None

def _lemma_set(forms):
    """The set of lemmas, so a candidate that IS already a lemma resolves.

    load_lemmas() maps form -> lemma, and a lemma is not always present as a
    form of itself: forms.get('haber') misses, so stripping the enclitic off
    "haberos" produced 'haber' and then threw it away. That single gap made
    every haber-keyed contextual rule miss its enclitic forms.
    """
    global _LEMMA_SET
    if _LEMMA_SET is None:
        vals = set()
        for v in forms.values():
            if isinstance(v, (list, set, tuple)):
                vals.update(v)
            else:
                vals.add(v)
        _LEMMA_SET = vals
    return _LEMMA_SET


def context_lemma(word, forms):
    """Lemma of a NEIGHBOURING word, for the contextual gloss rules.

    Reuses the same enclitic/morphology cascade as the main lookup, because
    the plain word list has no entry for haber+enclitic ("haberos").
    """
    k = normalise(word)
    if not k:
        return ''
    hit = forms.get(k)
    if hit:
        return list(hit)[0] if isinstance(hit, (list, set, tuple)) else hit
    lemmas = _lemma_set(forms)
    if k in lemmas:
        return k
    for cand in morph_candidates(k):
        hit = forms.get(cand)
        if hit:
            return list(hit)[0] if isinstance(hit, (list, set, tuple)) else hit
        if cand in lemmas:
            return cand
    return k


def is_finite_verb(word, lex, forms):
    """True when `word` is a conjugated verb (not an infinitive or participle).

    Used to tell a participial absolute ("arrepentido, devolvio" = repented)
    from a predicate adjective ("verdaderamente arrepentidos, y" = penitent).
    """
    k = normalise(word)
    if not k or k.endswith(('ar', 'er', 'ir')):
        return False
    if k.endswith(('ado', 'ido', 'ados', 'idos', 'ando', 'iendo')):
        return False
    lemma = context_lemma(k, forms)
    if lemma == k:
        return False
    tr = lex.get(lemma) or ''
    return '(verb)' in tr or lemma.endswith(('ar', 'er', 'ir'))


def name_key(w):
    """Fold a name to a spelling-neutral key so Nefi==Nephi, Judá==Judah."""
    x = _strip_accents(w).lower()
    x = x.replace('ph','f').replace('th','t').replace('kh','c')
    x = x.replace('k','c').replace('qu','c').replace('z','s')
    x = x.replace('j','h').replace('y','i').replace('w','v')
    x = x.replace('ll','l').replace('rr','r').replace('ss','s')
    x = x.rstrip('h')                      # Judah / Judá
    x = ''.join(ch for ch in x if ch.isalnum())
    return x

def name_skeleton(w):
    """Consonant skeleton. Transliterated names keep their consonants and let
    the vowels drift — Moisés/Moses, Josué/Joshua, Isaías/Isaiah — so matching
    on consonants catches the pairs that a letter-by-letter fold misses."""
    x = name_key(w)
    x = x.replace('sh', 's')
    sk = ''.join(ch for ch in x if ch not in 'aeiou')
    # collapse doubled consonants left by the fold
    out = []
    for ch in sk:
        if not out or out[-1] != ch:
            out.append(ch)
    return ''.join(out)

STRIP = '.,;:¿?¡!»«()"“”—-–…'

def normalise(word):
    return word.lower().strip(STRIP).strip()

_SELFGLOSS = None


def _has_verb_lemma(w, lex):
    """Does this form have a verb lemma the dictionary knows?

    Used when the syntax guarantees a verb -- after a reflexive clitic, "se
    hincha" can only be a verb -- so the modern noun entry must be skipped.
    The dictionary is contemporary Spanish: `hincha` is listed as "fan (noun)",
    a football supporter, and that reading won until this.
    """
    try:
        import spa_conjug
        tags = spa_conjug.form_index().get(w) or []
    except Exception:
        return False
    return any(l in lex and t != 'inf' for l, t in tags)


def _prefer_lemma(w, lex):
    """True when a CONJUGATED verb form should be looked up by its lemma.

    Direct dictionary entries for conjugated forms are junk in three distinct
    ways, and all three produced broken English:

        empezaron -> "empezaron (verb; 3rd person plural)"  -> "empezaron (verb"
        llegaron  -> "they arrived (verb)"                  -> "they-theyed arrived"
        estaban   -> "were (verb)"                          -> "they-wered"

    The last one is the reason a skip-list is not enough: the entry looks
    perfectly clean, it is simply ALREADY inflected, so inflecting it again
    doubles the ending. The lemma plus the conjugation tag gives the right
    answer in every case -- estar + impf.3p is "they were".

    Guarded by part of speech, so genuine homograph nouns keep their direct
    entry: vino (wine), casa (house), pueblo (people) are tagged NOUN.
    """
    try:
        import spa_conjug
        tags = spa_conjug.form_index().get(w)
    except Exception:
        return False
    if not tags:
        return False
    if all(t == 'inf' or l == w for l, t in tags):
        return False              # the infinitive itself: its entry is the lemma's
    try:
        import spa_morph
        pos = spa_morph.pos(w)
        if pos and pos not in ('VERB', 'AUX'):
            return False
    except Exception:
        pass
    # only divert when the lemma actually has an entry to divert to
    return any(l in lex for l, _t in tags)


def gloss_candidates(word, lex, forms, names=None, prefer_verb=False):
    """Return (source, english) or (None, None).

    Four passes, cheapest first: the dictionary itself, the lemma list, the
    proper-name table, then morphology generated from the paradigms above.
    The last one exists so a form the word lists never recorded still resolves
    instead of being reported as a miss."""
    w = normalise(word)
    if not w:
        return None, None
    if w in lex and not _prefer_lemma(w, lex) and not (
            prefer_verb and _has_verb_lemma(w, lex)):
        return 'direct', lex[w]
    for lemma in sorted(forms.get(w, ())):
        if lemma in lex:
            return 'lemma:' + lemma, lex[lemma]
    if names:
        hit = names.get(name_key(w))
        if hit:
            return 'name', hit
    sup = load_supplement()
    if w in sup:
        return 'added', sup[w]
    for cand in morph_candidates(w):
        if cand in lex:
            return 'morph:' + cand, lex[cand]
        for lemma in sorted(forms.get(cand, ())):
            if lemma in lex:
                return 'morph:' + cand + '>' + lemma, lex[lemma]
    return None, None

def first_sense(translation):
    """'city (noun)' -> 'city'; 'who (pronoun); whom (pronoun)' -> 'who'."""
    first = translation.split(';')[0]
    return re.sub(r'\s*\([^)]*\)\s*', '', first).strip()

def main(argv):
    lex, forms = load_lexicon(), load_lemmas()
    if argv and argv[0] == '--coverage':
        import glob
        TOK = re.compile(r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]')
        types = Counter()
        for f in glob.glob(os.path.join(ROOT, 'verses', '*.js')):
            for sp, en in TOK.findall(open(f, encoding='utf-8').read()):
                k = normalise(sp)
                if k:
                    types[k] += 1
        direct = lemma = 0
        dt = lt = 0
        for w, n in types.items():
            src, _ = gloss_candidates(w, lex, forms)
            if src == 'direct':
                direct += 1; dt += n
            elif src:
                lemma += 1; lt += n
        tot_types, tot_tokens = len(types), sum(types.values())
        print("corpus: %d types, %d tokens" % (tot_types, tot_tokens))
        print("  direct dictionary hit : %6d types (%4.1f%%)  %8d tokens (%4.1f%%)"
              % (direct, 100*direct/tot_types, dt, 100*dt/tot_tokens))
        print("  via lemma             : %6d types (%4.1f%%)  %8d tokens (%4.1f%%)"
              % (lemma, 100*lemma/tot_types, lt, 100*lt/tot_tokens))
        print("  TOTAL                 : %6d types (%4.1f%%)  %8d tokens (%4.1f%%)"
              % (direct+lemma, 100*(direct+lemma)/tot_types, dt+lt, 100*(dt+lt)/tot_tokens))
        return 0
    if not argv:
        print(__doc__)
        return 1
    for w in argv:
        src, tr = gloss_candidates(w, lex, forms)
        if tr:
            lemma = src.split(':')[1].split('>')[0] if ':' in src else w
            print("%-16s %-12s %-22s %s" % (w, '[' + src + ']', first_sense(tr),
                                            '-> ' + _shape(w, lemma, tr, first_sense)))
        else:
            print("%-16s %-12s (no entry)" % (w, '[miss]'))
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
