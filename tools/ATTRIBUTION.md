# Third-party data used by the glossing tools

The Spanish gloss toolchain is built on published linguistic resources rather
than hand-written tables. Each is listed here with its source and licence,
because several are copyleft and redistributing them carries obligations.

| file | source | licence |
|---|---|---|
| `lemmatization-es.txt` | [michmech/lemmatization-lists](https://github.com/michmech/lemmatization-lists) — 497,560 Spanish form→lemma pairs | **CC BY-SA 4.0** |
| `conjugation-es.json`, `verbs-es.json` | [mlconjug3](https://github.com/SekouDiaoNlp/mlconjug3) Spanish conjugation tables, Verbiste lineage — 9,732 verbs | MIT (project); **GPL** applies to the Verbiste-derived tables |
| `en-verbs.txt` | [CLiPS Pattern](https://github.com/clips/pattern) English verb lexicon (UPenn XTAG lineage) — 8,466 verbs | **BSD-3-Clause** |
| `words_alpha.txt` | [dwyl/english-words](https://github.com/dwyl/english-words) — 370,105 English words | Unlicense (public domain) |
| `english_animate.json` | derived from [Open English WordNet](https://github.com/globalwordnet/english-wordnet) noun.person / noun.animal / noun.group | **CC BY 4.0** |
| `spa_morph.json` | derived from [UD Spanish AnCora](https://github.com/UniversalDependencies/UD_Spanish-AnCora) and [UD Spanish GSD](https://github.com/UniversalDependencies/UD_Spanish-GSD) — 925,993 tagged tokens | **CC BY-SA 4.0** (AnCora), CC BY-SA 4.0 (GSD) |

## Not committed

Two sets of source files are gitignored because nothing loads them at run
time — they are read once by a generator and the derived artefact is what
ships. Re-download them with the URLs in the generator that consumes them:

- `tools/*.conllu` — the UD treebanks (71 MB), read by `build_morph.py` to
  produce `spa_morph.json`
- `tools/noun.*.yaml` — the WordNet lexicographer files (8.5 MB), read by
  `build_palettes.py`/the animacy build to produce `english_animate.json`

## Note on share-alike

`lemmatization-es.txt` and the UD-derived `spa_morph.json` are **CC BY-SA**.
Attribution is given above. Anyone redistributing those files, or a database
derived from them, is subject to the same licence. The scripture text, the
translation and the gloss column are the author's own work and are not covered
by these licences.
