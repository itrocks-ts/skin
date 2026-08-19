# Plan de développement de `@itrocks/skin`

Ce document est l’index des spécifications du package. Il constitue la source de vérité pour leur ordre, leur statut et
leurs preuves de validation.

Dernière mise à jour : 2026-08-19<br>
État actuel : **résolveur déterministe terminé et validé**<br>
Prochaine action : **statuer sur les questions de SKIN-S020 et SKIN-S030 avant leur développement**

## Objectif

Permettre à une application it.rocks, à un package de skin ou à un module applicatif de remplacer des gabarits HTML,
des feuilles de style CSS et des images JPG ou PNG appartenant à un autre package, au moyen d’une table `skin` fusionnée
par `@itrocks/config`.

Le package agit uniquement sur les fichiers finaux utilisés à l’exécution. Les sources sous `src/`, les SCSS et les
autres fichiers de développement sont hors périmètre.

## Approche proposée

L’[architecture proposée](architecture.md) s’appuie sur les points de composition déjà présents :

1. un résolveur transforme le chemin d’un artefact publié en chemin de remplacement ;
2. `SkinTemplate extends Template` résout les gabarits HTML finaux avant leur lecture ;
3. `SkinFastifyServer extends FastifyServer` redirige les CSS, JPG et PNG vers leur remplacement ;
4. `config.yaml` compose ces deux classes avant le chargement du framework.

Cette approche ne demande aucune modification de `@itrocks/framework`, `@itrocks/template` ou `@itrocks/fastify` dans
sa première version. Un hook plus étroit dans `@itrocks/fastify` ne sera envisagé que si les tests montrent que la
surcharge de `httpCall()` ne peut pas préserver son comportement.

## Statuts

- `draft` : une décision proposée doit encore être validée.
- `ready` : la spécification est développable sans décision supplémentaire.
- `in-progress` : son développement a explicitement commencé.
- `blocked` : un obstacle externe empêche une spécification auparavant prête.
- `done` : tous les critères et validations applicables ont réussi.

## Spécifications

| Ordre | Spécification               | Dépendances     | Statut  | Questions |
|------:|-----------------------------|-----------------|---------|----------:|
| 0010  | [SKIN-S010 — Résolution]    | —               | `done`  | 0         |
| 0020  | [SKIN-S020 — HTML]          | SKIN-S010       | `draft` | 1         |
| 0030  | [SKIN-S030 — CSS et images] | SKIN-S010       | `draft` | 1         |
| 0040  | [SKIN-S040 — Stabilisation] | SKIN-S020, S030 | `ready` | 0         |

## Preuves de validation

### SKIN-S010 — Résolution

- `npm test` : 15 tests réussis sur les alias, priorités, extensions, racines, traversées et liens symboliques ;
- test de situation réelle : l’alias `@itrocks/list/feed.html` résout le fichier final voisin
  `@itrocks/list/cjs/feed.html` vers un remplacement installé dans `@itrocks/home` ;
- `npm pack --dry-run --json` : l’archive contient la façade, le résolveur JavaScript et ses déclarations, sans les
  sources, tests ni source maps.

[SKIN-S010 — Résolution]: specifications/010-resolution.md
[SKIN-S020 — HTML]: specifications/020-remplacement-html.md
[SKIN-S030 — CSS et images]: specifications/030-service-css-et-images.md
[SKIN-S040 — Stabilisation]: specifications/040-stabilisation.md

## Ordre de développement

```text
SKIN-S010 Résolveur
├── SKIN-S020 HTML
└── SKIN-S030 CSS et images
    └── SKIN-S040 Stabilisation
```

SKIN-S020 et SKIN-S030 pourront être développées en parallèle une fois SKIN-S010 terminée. Une seule spécification sera
cependant implémentée par tâche, sauf demande explicite contraire.

## Décisions demandées

Les recommandations sont détaillées dans chaque spécification. Une validation groupée peut prendre cette forme :

```text
SKIN-S010-Q1 : stricte.
SKIN-S020-Q1 : contexte du remplacement.
SKIN-S030-Q1 : composition sans hook Fastify.
```
