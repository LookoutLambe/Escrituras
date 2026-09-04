#!/usr/bin/env python3
"""Generated Spanish paradigms — the whole conjugation, not a stripping guess.

The lemma list answers "what is the lemma of this form". It does NOT answer
"what person, number and tense is this form", and that is the answer an
interlinear gloss actually needs: `sereis` must read "ye shall be", not the
bare infinitive "to be". Stripping endings off a surface form cannot give it,
because the endings are ambiguous (-a is 3sg present of an -ar verb AND 2sg
imperative AND a feminine singular noun).

So generate instead of analyse: build every form each lemma can take, tagged
with its features, and index form -> [(lemma, tag)]. Same lesson as the Hebrew
tool, where generated lookup beat morphological analysis 89.5% to 43.9%.

The corpus is Reina-Valera peninsular Spanish -- 2,447 `vosotros`, 3,360 `os`,
5,702 -ais/-eis verbs and ZERO `ustedes` -- so the vosotros column is not
optional here, and voseo (tenes, sos) is deliberately absent.
"""
import re, unicodedata

# ── vowel accentuation helpers ──────────────────────────────────────────────
_ACC = {'a':'á','e':'é','i':'í','o':'ó','u':'ú'}
_DEA = {v: k for k, v in _ACC.items()}

def deaccent(w):
    return ''.join(_DEA.get(c, c) for c in w)

def strip_all(w):
    return ''.join(c for c in unicodedata.normalize('NFD', w)
                   if unicodedata.category(c) != 'Mn')

PERSONS = ('1s', '2s', '3s', '1p', '2p', '3p')

# ── regular endings, all six persons, vosotros included ─────────────────────
REG = {
 'ar': {
  'pres': ('o','as','a','amos','áis','an'),
  'pret': ('é','aste','ó','amos','asteis','aron'),
  'impf': ('aba','abas','aba','ábamos','abais','aban'),
  'subj': ('e','es','e','emos','éis','en'),
  'subji':('ara','aras','ara','áramos','arais','aran'),
  'subjs':('ase','ases','ase','ásemos','aseis','asen'),
  'subjf':('are','ares','are','áremos','areis','aren'),
  'imp':  (None,'a',None,'emos','ad',None),
  'part': 'ado', 'ger': 'ando',
 },
 'er': {
  'pres': ('o','es','e','emos','éis','en'),
  'pret': ('í','iste','ió','imos','isteis','ieron'),
  'impf': ('ía','ías','ía','íamos','íais','ían'),
  'subj': ('a','as','a','amos','áis','an'),
  'subji':('iera','ieras','iera','iéramos','ierais','ieran'),
  'subjs':('iese','ieses','iese','iésemos','ieseis','iesen'),
  'subjf':('iere','ieres','iere','iéremos','iereis','ieren'),
  'imp':  (None,'e',None,'amos','ed',None),
  'part': 'ido', 'ger': 'iendo',
 },
 'ir': {
  'pres': ('o','es','e','imos','ís','en'),
  'pret': ('í','iste','ió','imos','isteis','ieron'),
  'impf': ('ía','ías','ía','íamos','íais','ían'),
  'subj': ('a','as','a','amos','áis','an'),
  'subji':('iera','ieras','iera','iéramos','ierais','ieran'),
  'subjs':('iese','ieses','iese','iésemos','ieseis','iesen'),
  'subjf':('iere','ieres','iere','iéremos','iereis','ieren'),
  'imp':  (None,'e',None,'amos','id',None),
  'part': 'ido', 'ger': 'iendo',
 },
}
# future and conditional attach to the whole infinitive
FUT  = ('é','ás','á','emos','éis','án')
COND = ('ía','ías','ía','íamos','íais','ían')

# ── stem changes: which persons are stressed on the stem ────────────────────
STRESSED = (0, 1, 2, 5)          # 1s 2s 3s 3p — the "boot"

STEM_CHANGE = {          # lemma -> (from, to) applied in stressed persons
 'e_ie': ('e','ie'), 'o_ue': ('o','ue'), 'e_i': ('e','i'), 'u_ue': ('u','ue'),
}

# Verbs whose stem changes, by family. Kept explicit: Spanish gives no rule
# that predicts which e becomes ie (pensar->pienso) and which does not
# (pesar->peso), so it has to be listed.
E_IE = """pensar cerrar comenzar empezar entender perder querer sentar sentir
mentir herir hervir preferir referir sugerir convertir advertir divertir
despertar gobernar helar negar quebrar recomendar temblar tender defender
descender encender extender atender acertar apretar atravesar calentar
confesar enterrar manifestar merendar nevar sembrar tropezar
consentir presentir arrepentir invertir digerir""".split()
O_UE = """contar costar encontrar mostrar probar recordar volar acostar almorzar
aprobar colgar demostrar rogar soltar sonar soñar tostar volcar mover poder
volver doler llover morder resolver soler torcer devolver envolver revolver
dormir morir cocer moler oler""".split()
E_I  = """pedir servir repetir seguir conseguir perseguir vestir medir reír
sonreír freír gemir competir despedir impedir rendir corregir elegir regir
teñir ceñir henchir""".split()
U_UE = ['jugar']

def _stem_family(lemma):
    l = lemma.rstrip('se')
    for fam, words in (('e_ie', E_IE), ('o_ue', O_UE), ('e_i', E_I), ('u_ue', U_UE)):
        if lemma in words or l in words:
            return fam
    return None

def _apply_stem_change(stem, fam):
    """Change the LAST eligible vowel — recordar -> recuerd, not rocuerd."""
    src, dst = STEM_CHANGE[fam]
    i = stem.rfind(src)
    return stem[:i] + dst + stem[i + 1:] if i >= 0 else stem

# ── orthographic repairs, applied after the ending is attached ──────────────
def _ortho(form, stem, ending, inf):
    """Spelling changes Spanish makes to preserve the consonant's sound."""
    e0 = ending[0] if ending else ''
    if inf.endswith('car') and e0 in 'eé':      # buscar -> busqué
        return stem[:-1] + 'qu' + ending
    if inf.endswith('gar') and e0 in 'eé':      # pagar -> pagué
        return stem + 'u' + ending
    if inf.endswith('zar') and e0 in 'eé':      # cruzar -> crucé
        return stem[:-1] + 'c' + ending
    if inf.endswith(('ger','gir')) and e0 in 'ao':   # coger -> cojo
        return stem[:-1] + 'j' + ending
    if inf.endswith('guir') and e0 in 'ao':     # seguir -> sigo
        return stem[:-1] + ending
    if inf.endswith('guar') and e0 in 'eé':     # averiguar -> averigüé
        return stem[:-1] + 'ü' + ending
    if inf.endswith(('cer','cir')) and e0 in 'ao' and len(stem) > 1 \
            and stem[-2] not in 'aeiou':        # vencer -> venzo
        return stem[:-1] + 'z' + ending
    # unstressed i between vowels becomes y: creer -> creyó, caer -> cayeron
    if ending[:1] == 'i' and stem and stem[-1] in 'aeiou' and len(ending) > 1 \
            and ending[1] in 'oeé':
        return stem + 'y' + ending[1:]
    return stem + ending


# ── irregular verbs ─────────────────────────────────────────────────────────
# Only what cannot be derived. Everything else falls through to the regular
# tables above, and prefixed verbs inherit (detener from tener, componer from
# poner), so this stays a short list rather than a dictionary of its own.

IRR_PRES = {
 'ser':   ('soy','eres','es','somos','sois','son'),
 'estar': ('estoy','estás','está','estamos','estáis','están'),
 'haber': ('he','has','ha','hemos','habéis','han'),
 'ir':    ('voy','vas','va','vamos','vais','van'),
 'dar':   ('doy','das','da','damos','dais','dan'),
 'ver':   ('veo','ves','ve','vemos','veis','ven'),
 'oír':   ('oigo','oyes','oye','oímos','oís','oyen'),
 'tener': ('tengo','tienes','tiene','tenemos','tenéis','tienen'),
 'venir': ('vengo','vienes','viene','venimos','venís','vienen'),
 'decir': ('digo','dices','dice','decimos','decís','dicen'),
 'hacer': ('hago','haces','hace','hacemos','hacéis','hacen'),
 'poner': ('pongo','pones','pone','ponemos','ponéis','ponen'),
 'salir': ('salgo','sales','sale','salimos','salís','salen'),
 'valer': ('valgo','vales','vale','valemos','valéis','valen'),
 'traer': ('traigo','traes','trae','traemos','traéis','traen'),
 'caer':  ('caigo','caes','cae','caemos','caéis','caen'),
 'saber': ('sé','sabes','sabe','sabemos','sabéis','saben'),
 'caber': ('quepo','cabes','cabe','cabemos','cabéis','caben'),
 'conducir':('conduzco','conduces','conduce','conducimos','conducís','conducen'),
 'conocer':('conozco','conoces','conoce','conocemos','conocéis','conocen'),
 'nacer': ('nazco','naces','nace','nacemos','nacéis','nacen'),
 'parecer':('parezco','pareces','parece','parecemos','parecéis','parecen'),
 'huir':  ('huyo','huyes','huye','huimos','huís','huyen'),
}

# strong preterites: stressed on the STEM, so the endings lose their accents
STRONG_PRET = {
 'tener':'tuv','estar':'estuv','andar':'anduv','haber':'hub','poder':'pud',
 'poner':'pus','saber':'sup','caber':'cup','hacer':'hic','querer':'quis',
 'venir':'vin','decir':'dij','traer':'traj','conducir':'conduj','ver':'v',
}
PRET_ENDINGS  = ('e','iste','o','imos','isteis','ieron')
PRET_J        = ('e','iste','o','imos','isteis','eron')      # after j: dijeron

FULL_PRET = {
 'ser': ('fui','fuiste','fue','fuimos','fuisteis','fueron'),
 'ir':  ('fui','fuiste','fue','fuimos','fuisteis','fueron'),
 'dar': ('di','diste','dio','dimos','disteis','dieron'),
 'ver': ('vi','viste','vio','vimos','visteis','vieron'),
}
FULL_IMPF = {
 'ser': ('era','eras','era','éramos','erais','eran'),
 'ir':  ('iba','ibas','iba','íbamos','ibais','iban'),
 'ver': ('veía','veías','veía','veíamos','veíais','veían'),
}
SUBJ_STEM = {          # present-subjunctive stem where it is not the 1sg
 'ser':'se','ir':'vay','haber':'hay','saber':'sep','dar':'d','estar':'est',
}
FUT_STEM = {
 'tener':'tendr','poner':'pondr','venir':'vendr','salir':'saldr','valer':'valdr',
 'poder':'podr','saber':'sabr','caber':'cabr','haber':'habr','hacer':'har',
 'decir':'dir','querer':'querr',
}
IRR_PART = {
 'hacer':'hecho','decir':'dicho','ver':'visto','poner':'puesto','volver':'vuelto',
 'morir':'muerto','abrir':'abierto','cubrir':'cubierto','escribir':'escrito',
 'romper':'roto','resolver':'resuelto','ir':'ido','ser':'sido','freír':'frito',
 'imprimir':'impreso','satisfacer':'satisfecho',
}
IRR_GER = {
 'ir':'yendo','decir':'diciendo','venir':'viniendo','poder':'pudiendo',
 'dormir':'durmiendo','morir':'muriendo','pedir':'pidiendo','sentir':'sintiendo',
 'servir':'sirviendo','seguir':'siguiendo','traer':'trayendo','caer':'cayendo',
 'oír':'oyendo','leer':'leyendo','creer':'creyendo','huir':'huyendo',
 'ser':'siendo','reír':'riendo','vestir':'vistiendo','mentir':'mintiendo',
}
IRR_IMP_TU = {   # affirmative tu imperative
 'tener':'ten','venir':'ven','poner':'pon','salir':'sal','hacer':'haz',
 'decir':'di','ser':'sé','ir':'ve','valer':'val',
}

# prefixed verbs inherit their base's irregularities
# Two classes of base verb, because one rule cannot serve both.
#
# FREE_BASES are long and unambiguous: no ordinary Spanish verb happens to end
# in "-poner" or "-tener" without being a compound of it, so any prefix goes.
# That is what lets oponer, advenir and desconvenir inherit without listing
# every prefix by hand.
#
# The short ones cannot: "coser" ends in "ser", "molestar" in "estar",
# "mandar" in "andar", "quedar" in "dar". Free prefixing there yields "cosoy"
# and "molestoy". They inherit only through the explicit table below.
FREE_BASES = {'tener','poner','venir','hacer','decir','traer','salir','caber',
              'saber','poder','querer','conducir','conocer','parecer','nacer',
              'valer','huir','sentir','dormir','morir','vestir','seguir'}

EXPLICIT_COMPOUNDS = {
    'prever':'ver', 'entrever':'ver', 'rever':'ver',
    'desoír':'oír', 'entreoír':'oír', 'trasoír':'oír',
    'desandar':'andar', 'desdar':'dar', 'condar':'dar',
    'rehacer':'hacer',
}

# -facer is the old form of -hacer and keeps its irregularities:
# satisfacer -> satisfago, satisfaga, satisfice, satisfara, satisfecho.
FACER = ('satisfacer', 'rarefacer', 'licuefacer', 'desfacer', 'tumefacer',
         'putrefacer', 'contrahacer')

def base_verb(lemma):
    """detener -> tener, componer -> poner, bendecir -> decir."""
    known = (set(IRR_PRES) | set(STRONG_PRET) | set(FUT_STEM) | set(FULL_PRET)
             | set(FULL_IMPF) | set(SUBJ_STEM) | set(IRR_PART) | set(IRR_GER)
             | set(IRR_IMP_TU))
    # -facer before the `known` test: satisfacer is listed in IRR_PART, which
    # would otherwise return it as its own base and lose every other form.
    if lemma.endswith('facer') and len(lemma) > 5:
        return 'hacer'
    if lemma in known:
        return lemma
    if lemma in EXPLICIT_COMPOUNDS:
        return EXPLICIT_COMPOUNDS[lemma]
    for b in FREE_BASES:
        if lemma.endswith(b) and len(lemma) > len(b) and b in known:
            return b
    return None


def _raise_ir(stem, fam):
    """-ir stem-changers RAISE the vowel in 3sg/3pl preterite and the gerund:
    pedir->pidio, sentir->sintio, dormir->durmio, morir->murio.  It is a direct
    e->i / o->u, NOT the e->ie / o->ue diphthong of the present tense; going
    through the diphthong first produced "duermio" and "muerio"."""
    src, dst = ('e', 'i') if fam in ('e_ie', 'e_i') else ('o', 'u')
    i = stem.rfind(src)
    return stem[:i] + dst + stem[i + 1:] if i >= 0 else stem


def _prefixed(forms, inf, base):
    """Carry a base verb's irregular forms onto its prefixed compound."""
    if inf == base:
        return forms
    if inf.endswith('facer') and base == 'hacer':
        pre = inf[:-5]                       # satisfacer -> satis + f-forms
        return tuple((pre + 'f' + f[1:]) if f else None for f in forms)
    pre = inf[:len(inf) - len(base)]
    return tuple((pre + f) if f else None for f in forms)


def conjugate(lemma):
    """Every form of a verb, tagged. Returns {form: tag}.

    Tags are 'tense.person' (pres.2p, pret.3s, fut.1s ...) plus part/ger/inf.
    """
    out = {}
    if not lemma or len(lemma) < 3:
        return out
    inf, refl = lemma, False
    if inf.endswith(('arse', 'erse', 'irse')):
        inf, refl = inf[:-2], True
    suf = inf[-2:]
    if suf not in REG:
        return out
    stem, R = inf[:-2], REG[suf]
    base, fam = base_verb(inf), _stem_family(inf)

    def put(f, t):
        if f and f not in out:
            out[f] = t

    put(inf, 'inf')

    # ── present ──
    if base in IRR_PRES:
        for i, f in enumerate(_prefixed(IRR_PRES[base], inf, base)):
            put(f, 'pres.' + PERSONS[i])
    else:
        for i, e in enumerate(R['pres']):
            st = _apply_stem_change(stem, fam) if (fam and i in STRESSED) else stem
            put(_ortho(st + e, st, e, inf), 'pres.' + PERSONS[i])

    # ── preterite ──
    if base in FULL_PRET:
        for i, f in enumerate(_prefixed(FULL_PRET[base], inf, base)):
            put(f, 'pret.' + PERSONS[i])
    elif base in STRONG_PRET:
        ps = _prefixed((STRONG_PRET[base],), inf, base)[0]
        ends = PRET_J if ps.endswith('j') else PRET_ENDINGS
        for i, e in enumerate(ends):
            put(ps + e, 'pret.' + PERSONS[i])
    else:
        for i, e in enumerate(R['pret']):
            st = stem
            # -ir stem-changers raise the vowel in 3sg/3pl: pedir -> pidio
            if suf == 'ir' and fam and i in (2, 5):
                st = _raise_ir(stem, fam)
            put(_ortho(st + e, st, e, inf), 'pret.' + PERSONS[i])

    # ── imperfect ──
    src = FULL_IMPF.get(base)
    if src:
        for i, f in enumerate(_prefixed(src, inf, base)):
            put(f, 'impf.' + PERSONS[i])
    else:
        for i, e in enumerate(R['impf']):
            put(stem + e, 'impf.' + PERSONS[i])

    # ── future / conditional (on the infinitive, or an irregular stem) ──
    fs = _prefixed((FUT_STEM[base],), inf, base)[0] if base in FUT_STEM else inf
    for i, e in enumerate(FUT):
        put(fs + e, 'fut.' + PERSONS[i])
    for i, e in enumerate(COND):
        put(fs + e, 'cond.' + PERSONS[i])

    # ── subjunctive: built on the 1sg present, except where listed ──
    if base in SUBJ_STEM:
        ss = _prefixed((SUBJ_STEM[base],), inf, base)[0]
    else:
        p1 = next((f for f, t in out.items() if t == 'pres.1s'), None)
        ss = p1[:-1] if p1 and p1.endswith('o') else stem
    for i, e in enumerate(R['subj']):
        st = _apply_stem_change(ss, fam) if (fam and i in STRESSED and base not in SUBJ_STEM) else ss
        put(_ortho(st + e, st, e, inf), 'subj.' + PERSONS[i])

    # imperfect + future subjunctive: built on the 3pl preterite
    p3 = next((f for f, t in out.items() if t == 'pret.3p'), None)
    if p3:
        ps = p3[:-3] if p3.endswith('ron') else stem
        for key, ends in (('subji', ('ra','ras','ra','ramos','rais','ran')),
                          ('subjs', ('se','ses','se','semos','seis','sen')),
                          ('subjf', ('re','res','re','remos','reis','ren'))):
            for i, e in enumerate(ends):
                f = ps + e
                if i == 3:                     # 1pl carries the accent
                    v = [j for j, c in enumerate(ps) if c in 'aeiou']
                    if v:
                        k = v[-1]
                        f = ps[:k] + _ACC.get(ps[k], ps[k]) + ps[k + 1:] + e
                put(f, key + '.' + PERSONS[i])

    # ── imperative, participle, gerund ──
    tu = IRR_IMP_TU.get(base)
    put(_prefixed((tu,), inf, base)[0] if tu else
        (_apply_stem_change(stem, fam) if fam else stem) + R['imp'][1], 'imp.2s')
    put(stem + R['imp'][4], 'imp.2p')
    if refl:
        put(stem + R['imp'][4][:-1] + 'os', 'imp.2p')   # levantad -> levantaos
    put(_prefixed((IRR_PART[base],), inf, base)[0] if base in IRR_PART
        else stem + R['part'], 'part')
    if base in IRR_GER:
        put(_prefixed((IRR_GER[base],), inf, base)[0], 'ger')
    else:
        gs = _raise_ir(stem, fam) if (suf == 'ir' and fam) else stem
        put(_ortho(gs + R['ger'], gs, R['ger'], inf), 'ger')
    return out
