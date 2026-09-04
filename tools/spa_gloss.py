#!/usr/bin/env python3
"""
spa_gloss — turn a dictionary lemma into the gloss the SURFACE form needs.

spa_lookup answers "what does this word mean"; it answers with a lemma, which
is why it said "son" for hijos, "to go" for fueron and "beech tree" for haya.
A gloss has to match the form actually on the page. Three things are needed
and none of them come from a word list:

  1 INFLECTION  the English must carry the Spanish form's number and tense.
                hijos -> children, not son. diciendo -> saying, not to say.
  2 HOMOGRAPHS  haya is both the subjunctive of haber and a beech tree.
                Only context or a decision can separate them.
  3 REGISTER    this is scripture: desierto is wilderness, not desert.

Everything below is a paradigm or a decision, written down so the tool applies
it instead of me applying it by hand every time.
"""
import re

# ── 1. INFLECTION ────────────────────────────────────────────────────────────
# English verb morphology comes from eng_verbs.py (Pattern/UPenn lexicon,
# 8,466 verbs). The hand-typed IRREGULAR dict that used to live here held
# about forty verbs and produced "drived", "cry outed" and "receivs" for
# everything it did not know.
import eng_verbs as _EV

def _third(v):
    return _EV.third(v)

def _past(v):
    return _EV.past(v)

def _parti(v):
    return _EV.participle(v)

def _ing(v):
    return _EV.ing(v)

IRREGULAR = {}      # retained only so old references resolve; the lexicon wins


def pluralise(n):
    if re.search(r'(s|sh|ch|x|z)$', n):  return n + 'es'
    if re.search(r'[^aeiou]y$', n):      return n[:-1] + 'ies'
    if n.endswith('f'):                  return n[:-1] + 'ves'
    if n.endswith('fe'):                 return n[:-2] + 'ves'
    return n + 's'

IRREG_PLURAL = {'child':'children','man':'men','woman':'women','foot':'feet','tooth':'teeth',
                'ox':'oxen','person':'people','life':'lives','city':'cities'}

# Spanish surface ending -> which English form to build
VERB_SHAPE = [
    # ORDER MATTERS. The conditional ends in -ía exactly like the imperfect, so
    # it has to be tested first or sería reads as "was" instead of "would be".
    (r'r(ía|ías|íamos|íais|ían)$',                'would'),
    (r'r(é|ás|á|emos|éis|án)$',                   'future'),
    (r'(ando|iendo|yendo)$',                      'ing'),
    (r'(ado|ados|ada|adas|ido|idos|ida|idas)$',   'participle'),
    # -eron as well as -ieron: the strong preterites (dijeron, trajeron,
    # condujeron) drop the i. Same for -o without an accent (dijo, hizo, puso).
    (r'(aron|ieron|eron|ó|é|aste|iste|isteis|asteis|ieron|imos)$','past'),
    (r'(aba|abas|ábamos|abais|aban|ía|ías|íamos|íais|ían)$', 'past'),
    (r'(amos|emos|imos|áis|éis|ís|an|en|as|es)$', 'plain'),
    (r'(a|e)$',                                   'third'),
]

# ── context: what the neighbouring words say about this one ─────────────────
# A form in isolation cannot be glossed. "vino" is wine or came; "pueblo" is
# people or I-populate; "casa" is house or marries. The word before it decides:
# after a determiner or a preposition the reading is nominal, everywhere else
# the verb reading is live. Measured on this corpus, the signal is clean --
# pueblo 3,339 after a determiner against 155 elsewhere, casa 2,076 against
# 346, while dijo is 12 against 3,377.
# The closed classes come from the UD Spanish treebanks (925,993 tagged
# tokens), not from a hand-typed list. The hand lists had 70 determiners and 15
# prepositions and were missing possessives entirely -- which is why "nuestras"
# glossed as "provisions" instead of "our".
def _det():
    try:
        import spa_morph
        return spa_morph.determiners()
    except Exception:
        return set()

def _prep():
    try:
        import spa_morph
        return spa_morph.prepositions()
    except Exception:
        return set()

def _reflex():
    try:
        import spa_morph
        return spa_morph.reflexives()
    except Exception:
        return {'se', 'me', 'te', 'nos', 'os'}


def reflexive_position(prev_surface):
    return (prev_surface or '').lower().strip('.,;:¿?¡!»«()"“”— ') in _reflex()


def noun_position(prev_surface, surface):
    """True when the preceding word forces a nominal reading of `surface`."""
    p = (prev_surface or '').lower().strip('.,;:¿?¡!»«()"“”— ')
    if not p:
        return False
    if p in _det():
        return True
    if p in _prep() and not surface.lower().endswith(('ar', 'er', 'ir')):
        return True
    return False


# Tense/person tag -> the English shape. This is what the conjugation database
# buys: the tag is KNOWN, so no ending has to be guessed. "seria" and "temia"
# share an ending and split here on cond vs impf, which no regex can do.
TAG_SHAPE = {
    'inf': 'infinitive', 'part': 'participle', 'ger': 'ing',
    'pres': 'plain', 'pret': 'past', 'impf': 'past', 'fut': 'future',
    'cond': 'would', 'subj': 'may', 'subji': 'might', 'subjs': 'might',
    'subjf': 'should', 'imp': 'plain',
}

def _shape_from_tag(tag):
    """tag -> (shape, person). 'pres.3s' is the only present that takes -s."""
    if not tag:
        return None, None
    tense, _, person = tag.partition('.')
    if tense == 'pres' and person == '3s':
        return 'third', person
    return TAG_SHAPE.get(tense), person


def verb_tag(surface, lemma=None):
    """Tense+person of a Spanish verb form, from the conjugation database."""
    try:
        import spa_conjug
        return spa_conjug.verb_tag(surface, lemma)
    except Exception:
        return None


# Both conventions below were measured off the corpus, not chosen:
#   separator -- 51,843 multiword glosses use a hyphen, 3,217 a space.
#   pronouns  -- Spanish is pro-drop, so the person sits in the verb and the
#     gloss carries it: I-have, you-are, we-have (11,132 tokens). THIRD person
#     never does: 0 of 8,903 pres.3s, 0 of 24,506 pret.3s, 0 of 8,777 fut.3s,
#     because English marks it with -s and needs no pronoun.
# English "be" is suppletive and "have"/"do" are irregular in the 3rd singular,
# so person matters on the ENGLISH side too. Without this, ser 3pl "son" built
# the bare stem and glossed "be" instead of "are", and imperfect "eran" gave
# "was" for "were".
ENGLISH_PARADIGM = {
    'be':   {'pres': {'1s':'am','2s':'are','3s':'is','1p':'are','2p':'are','3p':'are'},
             'past': {'1s':'was','2s':'were','3s':'was','1p':'were','2p':'were','3p':'were'}},
    'have': {'pres': {'3s':'has'}, 'past': {}},
    'do':   {'pres': {'3s':'does'}, 'past': {}},
}

JOIN = '-'
# 3rd plural is always "they" -- unambiguous, and the translator asked for it:
# "empezaron" is "they began", not "began". 3rd SINGULAR stays bare because
# he/she/it cannot be chosen without knowing the subject, and English marks it
# with -s anyway ("says", "comes").
PRONOUN = {'1s': 'I', '2s': 'you', '1p': 'we', '2p': 'you', '3p': 'they'}
NON_FINITE = ('infinitive', 'participle', 'ing')

def _head_inflect(v, fn):
    """Inflect the HEAD of a phrasal verb: "cry out" -> "cried out".

    _past("cry out") appended to the particle and produced "cry outed"; the
    same broke "go out", "come to pass", "cast out" and every other phrasal
    verb in the dictionary.
    """
    parts = v.split()
    if len(parts) < 2:
        return fn(v)
    return ' '.join([fn(parts[0])] + parts[1:])


def _build(v, shape, person=None):
    par = ENGLISH_PARADIGM.get(v)
    if par and person:
        if shape in ('plain', 'third'):
            core = par['pres'].get(person) or (_head_inflect(v, _third) if shape == 'third' else v)
            return (PRONOUN[person] + JOIN + core) if person in PRONOUN else core
        if shape == 'past':
            core = par['past'].get(person) or _head_inflect(v, _past)
            return (PRONOUN[person] + JOIN + core) if person in PRONOUN else core
    if shape == 'ing':         core = _head_inflect(v, _ing)
    elif shape == 'participle':core = _head_inflect(v, _parti)
    elif shape == 'past':      core = _head_inflect(v, _past)
    elif shape == 'future':    core = 'will' + JOIN + v
    elif shape == 'would':     core = 'would' + JOIN + v
    elif shape == 'may':       core = 'may' + JOIN + v
    elif shape == 'might':     core = 'might' + JOIN + v
    elif shape == 'should':    core = 'should' + JOIN + v
    elif shape == 'third':     core = _head_inflect(v, _third)
    elif shape == 'infinitive':core = 'to' + JOIN + v
    else:                      core = v
    # the corpus writes multiword glosses with hyphens (51,843 against 3,217),
    # so a phrasal verb reads "they-went-out", not "they-went out"
    core = core.replace(' ', JOIN)
    pron = PRONOUN.get(person or '')
    if pron and shape not in NON_FINITE:
        core = pron + JOIN + core
    return core


def looks_like_verb(surface, raw_translation, base, tag):
    """Is this token a verb?

    first_sense() strips the "(verb)" marker, so testing the STRIPPED sense for
    it never matched and every verb recorded bare -- "enter (verb)", not "to
    enter" -- fell through to the noun branch and lost its tense: entrando
    glossed "enter" instead of "entering". Test the RAW entry, and fall back to
    the treebank's part of speech.
    """
    if base.startswith('to '):
        return True
    if tag is None:
        return False
    if '(verb' in (raw_translation or '') or '(v.' in (raw_translation or ''):
        return True
    try:
        import spa_morph
        return spa_morph.pos(surface) in ('VERB', 'AUX')
    except Exception:
        return False


def inflect(base, surface, lemma, prev_surface=None, verb=None, raw=None):
    """base is the dictionary sense ('to receive', 'advise', 'son', 'city').

    `verb`, when given, is the English verb to build from -- used to keep the
    translator's own word choice and correct only its inflection.
    """
    s, lem = surface.lower(), (lemma or '').lower()
    tag = verb_tag(s, lem)
    # A verb is not identified by the English starting with "to " alone -- the
    # dictionary records plenty bare, as "advise (verb)". But presence in the
    # conjugation index is NOT sufficient either: "a", "thus", "said" and
    # "wine" all have verb homographs, and treating them as verbs produced
    # "may-a", "I-thused", "saided". Require the dictionary to call it a verb.
    is_verb = looks_like_verb(s, raw, base, tag)
    if is_verb and noun_position(prev_surface, s):
        return None            # nominal slot: the caller keeps the noun gloss
    if is_verb:
        v = verb or (base[3:].strip() if base.startswith('to ') else base.strip())
        if not v:
            return None
        shape, person = _shape_from_tag(tag)
        if shape:
            return _build(v, shape, person)
        # fallback for forms the database does not carry
        for pat, shape in VERB_SHAPE:
            if re.search(pat, s):
                return _build(v, shape)
        return v
    # Spanish adjectives and participles agree in number; English ones do not.
    # Without this guard "arrepentidos" became "repenteds" and "apartados"
    # became "separateds" — 337 tokens of nonsense.
    if re.search(r'(ados|idos|adas|idas|ados|antes|entes|ientes)$', s):
        return base
    # nouns: carry the plural across
    if s.endswith(('s','es')) and lem and not lem.endswith(('s','es')):
        return IRREG_PLURAL.get(base, pluralise(base))
    return base

# ── 2. HOMOGRAPHS ────────────────────────────────────────────────────────────
# One spelling, two lemmas. The dictionary cannot choose; this text can.
STRONG_PRETERITE = {
    'dijo':'said','dijeron':'said','hizo':'made','hicieron':'made','puso':'put','pusieron':'put',
    'quiso':'wanted','pudo':'could','pudieron':'could','tuvo':'had','tuvieron':'had',
    'estuvo':'was','estuvieron':'were','anduvo':'walked','trajo':'brought','trajeron':'brought',
    'supo':'knew','cupo':'fit','condujo':'led','produjo':'produced',
}

HOMOGRAPHS = {
    'haya':  'let there be',   # haber (subjunctive), never the beech tree
    'hayan': 'have',
    'era':   'was',            # ser, not the noun "era"
    'eran':  'were',
    'fue':   'was',            # ser/ir — the canon decides per verse; default ser
    'fueron':'were',
    'vino':  'came',           # venir, not wine
    'vio':   'saw',
    'sobre': 'upon',           # preposition, not the noun "envelope"
    'como':  'as',             # not "I eat"
    'para':  'for',            # not "he stops"
    'llama': 'calls',          # llamar, not "flame"
    'cerca': 'near',           # not "fence"
    'orden': 'order',
    'tomo':  'take',
    'sal':   'salt',
}

# Words this text uses in a sense a general dictionary does not carry. The
# canon is the authority: Alma 32:7 renders "arrepentidos" as "penitent".
SCRIPTURAL = {
    # Possessive determiners. The treebank tags these DET/Poss=Yes; the old
    # hand lists had no possessive class at all, so "nuestras" was looked up as
    # a noun and glossed "provisions" 308 times.
    'nuestro':'our', 'nuestra':'our', 'nuestros':'our', 'nuestras':'our',
    'vuestro':'your', 'vuestra':'your', 'vuestros':'your', 'vuestras':'your',
    'mi':'my', 'mis':'my', 'tu':'your', 'tus':'your',
    'suyo':'his', 'suya':'his', 'suyos':'his', 'suyas':'his',
    # "sucedio que" is the narrative formula "it came to pass", with the "it";
    # bare "came to pass" drops the subject the English idiom needs.
    'sucedió':'it-came-to-pass', 'sucedio':'it-came-to-pass',
    'acaeció':'it-came-to-pass', 'acaecio':'it-came-to-pass',
    'aconteció':'it-came-to-pass', 'acontecio':'it-came-to-pass',
    'arrepentido':'penitent','arrepentidos':'penitent','arrepentida':'penitent',
    'arrepentidas':'penitent','arrepentimiento':'repentance','arrepentirse':'to repent',
    'expiación':'atonement','expiar':'to atone','expiatorio':'atoning',
    'iniquidad':'iniquity','iniquidades':'iniquities','maldad':'wickedness',
    'inicuo':'wicked','inicuos':'wicked','impío':'ungodly','impíos':'ungodly',
    'justo':'righteous','justos':'righteous','justicia':'righteousness',
    'rectitud':'righteousness','recto':'upright','misericordia':'mercy',
    'longanimidad':'long-suffering','mansedumbre':'meekness','manso':'meek',
    'humildad':'humility','humilde':'humble','soberbia':'pride','soberbio':'proud',
    'orgullo':'pride','contrito':'contrite','quebrantado':'broken',
    'convenio':'covenant','convenios':'covenants','ordenanza':'ordinance',
    'ordenanzas':'ordinances','sacerdocio':'priesthood','profeta':'prophet',
    'vidente':'seer','revelador':'revelator','apóstol':'apostle',
    'redención':'redemption','redentor':'Redeemer','salvación':'salvation',
    'salvador':'Savior','resurrección':'resurrection','inmortalidad':'immortality',
    'perdición':'perdition','condenación':'condemnation','juicio':'judgment',
    'testimonio':'testimony','testigo':'witness','anales':'records',
    'planchas':'plates','plancha':'plate','intérpretes':'interpreters',
    'liahona':'Liahona','urim':'Urim','tumim':'Thummim',
    'apostasía':'apostasy','restauración':'restoration','dispensación':'dispensation',
    'primogénito':'firstborn','unigénito':'Only Begotten','engendrado':'begotten',
    'gentiles':'Gentiles','gentil':'Gentile','remanente':'remnant',
    'tinieblas':'darkness','luz':'light','gloria':'glory','majestad':'majesty',
}

# ── 3. REGISTER ──────────────────────────────────────────────────────────────
# Where the dictionary and this text simply use different English.
REGISTER = {
    'desert':'wilderness', 'anger':'wrath', 'inheritance':'heritage',
    'town':'city', 'boat':'ship', 'kill':'slay', 'army':'armies',
    'sunset':'evening', 'impure':'unclean', 'jail':'prison',
    'guy':'man', 'children of israel':'children of Israel',
}

# ── modern English, not King James ─────────────────────────────────────────
# The gloss line is a modern rendering; the printed English canon is never
# touched. -est is the archaic 2nd singular and -eth the 3rd singular, so they
# become "you-know" and "comes" -- matching the person convention measured off
# this corpus (2s carries a pronoun, 3s does not).
#
# Three traps sit inside this class and must NOT be swept:
#   seth, heth  -- the NAMES Seth and Heth, 52 tokens
#   lest        -- an ordinary modern conjunction
#   strongest, fastest, faintest -- superlatives
ARCHAIC_KEEP = {
    'seth','heth','lest','best','rest','west','east','test','guest','honest',
    'forest','request','harvest','priest','breast','beneath','death','earth',
    'mouth','youth','truth','teeth','wreath','moth','both','cloth','path',
    'strength','length','birth','worth','north','south','faith','wrath','oath',
    'manifest','protest','conquest','interest','arrest','nest','chest','crest',
    'modest','earnest','tempest','wrest','behest','strongest','fastest',
    'faintest','greatest','latest','eldest','midst','amidst','against','beast',
}
# archaic stems whose modern form is not recoverable by rule
ARCHAIC_STEM = {
    'brakest':'broke', 'wouldest':'would', 'shouldest':'should',
    'couldest':'could', 'mightest':'might', 'mayest':'may', 'doest':'do',
    'didst':'did', 'hast':'have', 'hath':'has', 'art':'are', 'wert':'were',
    'shalt':'shall', 'wilt':'will', 'canst':'can', 'dost':'do', 'doth':'does',
    'saith':'says', 'spake':'spoke', 'brake':'broke', 'bare':'bore',
}

# -est / -eth attach to a stem that has already lost its silent e: cometh is
# com+eth and believest is believ+est. Restoring the bare stem gives "coms" and
# "believ". The corpus's own gloss vocabulary is the witness for which spelling
# is a real word -- the same self-consistency repair that fixed 723 -eth verbs.
_VOCAB = None

def _vocab():
    """Real English words, taken from the CANON -- not from the glosses.

    Building this from the gloss column made it circular: a junk gloss like
    "beginns" or "ands" appeared in the vocabulary and so validated itself,
    and the detector that was meant to catch it reported it as a real word.
    english_verses.js is 41,992 verses of actual English and is never edited,
    so it is the right authority.
    """
    global _VOCAB
    if _VOCAB is None:
        import os as _os
        root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
        words = set()
        try:
            with open(_os.path.join(root, 'english_verses.js'), encoding='utf-8') as fh:
                words.update(w.lower() for w in re.findall(r"[A-Za-z']+", fh.read()))
        except OSError:
            pass
        _VOCAB = words
    return _VOCAB


def _restore_e(stem):
    """com -> come, believ -> believe, know -> know."""
    v = _vocab()
    if stem in v and stem + 'e' not in v:
        return stem
    if stem + 'e' in v:
        return stem + 'e'
    return stem


# 2nd-singular archaics that do not end in -est but still take the you- marker
ARCHAIC_2S = {'mayest', 'doest', 'shouldest', 'wouldest', 'couldest',
              'mightest', 'brakest', 'didst', 'hast', 'wert', 'shalt',
              'wilt', 'canst', 'dost', 'art'}


def _modernise_word(w):
    """archaic -est / -eth verb -> its modern form, or None if not archaic."""
    lw = w.lower()
    if lw in ARCHAIC_KEEP:
        return None
    if lw in ARCHAIC_STEM:
        return ARCHAIC_STEM[lw]
    if len(lw) < 5:
        return None
    if lw.endswith('eth'):                      # cometh -> comes
        stem = _restore_e(lw[:-3])
        return _third(stem) if stem else None
    if lw.endswith('est'):                      # knowest -> know, madest -> made
        stem = lw[:-3]
        if not stem:
            return None
        if stem in ('mad', 'gav', 'cam', 'tak', 'gan'):
            return stem + 'e'
        return _restore_e(stem)
    return None


def modernise(gloss):
    """Rewrite any archaic verb inside a (possibly hyphenated) gloss."""
    out, changed = [], False
    for part in re.split(r'([-\s]+)', gloss):
        core = part.strip('.,;:!?')
        m = _modernise_word(core)
        if m is not None:
            tail = part[len(part.rstrip('.,;:!?')):]
            lw = core.lower()
            # the archaic -est is 2nd singular; this corpus marks it with you-
            if (lw.endswith('est') or lw in ARCHAIC_2S) and 'you' not in gloss.lower():
                m = 'you-' + m
            out.append(m + tail)
            changed = True
        else:
            out.append(part)
    return ''.join(out) if changed else gloss


# ── the translator's own vocabulary ────────────────────────────────────────
# The dictionary orders its senses its own way, and that order is often not
# the one this translation uses: salir lists "leave" before "go out", empezar
# lists "start" before "begin". Taking sense #1 silently overwrites the
# translator's word choice. build_sense_choice.py reads the choice off the
# existing corpus -- which sense the current glosses are actually forms of --
# and this table is the result. 227 lemmas.
_SENSE_CHOICE = None

def sense_choice(lemma):
    """The English verb THIS translation uses for a lemma, or None."""
    global _SENSE_CHOICE
    if _SENSE_CHOICE is None:
        import os, json as _json
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'spa_sense_choice.json')
        try:
            with open(path, encoding='utf-8') as fh:
                _SENSE_CHOICE = _json.load(fh)
        except OSError:
            _SENSE_CHOICE = {}
    return _SENSE_CHOICE.get((lemma or '').lower())


def apply_register(word):
    return modernise(REGISTER.get(word.lower(), word))

# ---------------------------------------------------------------------------
# Contextual glosses.  A few Spanish forms are genuinely two English words and
# only the preceding tokens tell them apart:
#     "se ha arrepentido"  = has repented      "corazon no arrepentido" = penitent
#     "sereis salvos"      = shall be saved    "salvo que"              = except
# The trigger is the LEMMA of a nearby word, resolved through the 497k-pair
# lemma list -- not a hand-written regex.  A regex here missed sereis, seremos,
# seamos, seais and the bare infinitive ser, and mislabelled 46 of 157 tokens.
# The dictionary already holds every conjugation, vosotros included; ask it.
def _after_haber(c):
    """A form of haber within the preceding few words -> perfect tense."""
    return 'haber' in c['prev'][-4:]

def _participial_absolute(c):
    """participle + comma + finite verb: "arrepentido, devolvio" = repented.
    A following "y" or a noun means it is a predicate adjective instead."""
    return c['comma_after'] and c['next_finite_verb']

def _repented(c):
    return _after_haber(c) or _participial_absolute(c)

def _passive_ser(c):
    """"sereis salvos" = shall be saved; bare "salvo" = except."""
    return bool({'ser', 'estar'} & set(c['prev'][-4:]))

CONTEXTUAL = {
    'arrepentido':  (_repented,   'repented', 'penitent'),
    'arrepentida':  (_repented,   'repented', 'penitent'),
    'arrepentidos': (_repented,   'repented', 'penitent'),
    'arrepentidas': (_repented,   'repented', 'penitent'),
    'salvo':        (_passive_ser, 'saved',   'except'),
    'salvos':       (_passive_ser, 'saved',   'except'),
    'salva':        (_passive_ser, 'saved',   'except'),
    'salvas':       (_passive_ser, 'saved',   'except'),
}


def gloss(surface, lemma, translation, first_sense, ctx=None):
    """The full pipeline: context -> vocabulary -> homograph -> inflection.

    Returns None to mean "leave the existing gloss alone" -- used when the
    token sits in a nominal slot and every table here would give a verb.
    """
    key = surface.lower().strip('.,;:¿?¡!»«()"“”— ')
    c = {'prev': [], 'prev_surface': '', 'comma_after': False,
         'next_finite_verb': False, 'keep_verb': None}
    c.update(ctx or {})

    # 1. explicit context rules come first: they are the ones that KNOW
    if key in CONTEXTUAL:
        trigger, yes, no = CONTEXTUAL[key]
        return yes if trigger(c) else no

    # 2. scriptural vocabulary: nouns, safe in any slot
    if key in SCRIPTURAL:
        return SCRIPTURAL[key]

    # 3. every table below returns a VERB reading, so the nominal slot has to
    #    be excluded before them, not after. "el vino" is the wine, and
    #    STRONG_PRETERITE would have called it "came" regardless of context.
    if noun_position(c['prev_surface'], key) or reflexive_position(c['prev_surface']):
        return None

    if key in STRONG_PRETERITE:
        return STRONG_PRETERITE[key]
    if key in HOMOGRAPHS:
        return HOMOGRAPHS[key]

    base = first_sense(translation)
    # the translator's established word for this lemma outranks sense #1
    learned = sense_choice(lemma)
    if learned:
        base = 'to ' + learned
    out = inflect(base, key, lemma, c['prev_surface'], c.get('keep_verb'),
                  raw=translation)
    if out is None:
        return None
    return apply_register(out)
