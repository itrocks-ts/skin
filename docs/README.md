# Plan de développement de `@itrocks/skin`

Ce document est l’index des spécifications du package. Il constitue la source de vérité pour leur ordre, leur statut et
leurs preuves de validation.

Dernière mise à jour : 2026-08-19<br>
État actuel : **package stabilisé, documenté et validé**<br>
Prochaine action : **aucune spécification ouverte**

## Objectif

Permettre à une application it.rocks, à un package de skin ou à un module applicatif de remplacer des gabarits HTML,
des feuilles de style CSS et des images JPG ou PNG appartenant à un autre package, au moyen d’une table `skin` fusionnée
par `@itrocks/config`.

Le package agit uniquement sur les fichiers finaux utilisés à l’exécution. Les sources sous `src/`, les SCSS et les
autres fichiers de développement sont hors périmètre.

## Approche livrée

L’[architecture livrée](architecture.md) s’appuie sur les points de composition déjà présents :

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
| 0020  | [SKIN-S020 — HTML]          | SKIN-S010       | `done`  | 0         |
| 0030  | [SKIN-S030 — CSS et images] | SKIN-S010       | `done`  | 0         |
| 0040  | [SKIN-S040 — Stabilisation] | SKIN-S020, S030 | `done`  | 0         |

## Preuves de validation

### SKIN-S010 — Résolution

- `npm test` : 15 tests réussis sur les alias, priorités, extensions, racines, traversées et liens symboliques ;
- test de situation réelle : l’alias `@itrocks/list/feed.html` résout le fichier final voisin
  `@itrocks/list/cjs/feed.html` vers un remplacement installé dans `@itrocks/home` ;
- `npm pack --dry-run --json` : l’archive contient la façade, le résolveur JavaScript et ses déclarations, sans les
  sources, tests ni source maps.

### SKIN-S020 — HTML

- `npm test` : 20 tests réussis au total, dont 5 tests d’intégration de `SkinTemplate` ;
- remplacements exacts validés à la racine, sous `cjs/`, sous `html/` et dans un sous-dossier ;
- règle de package validée sur une action, son container, un include relatif et la collecte de sa dépendance de head ;
- non-régression validée pour les sources sous `src/` et pour une cible installée dans `node_modules` sans substitution
  en chaîne.

### SKIN-S030 — CSS et images

- `npm test` : 27 tests réussis au total, dont 7 tests d’intégration HTTP de `SkinFastifyServer` ;
- CSS validés à la racine, sous `css/`, sous `cjs/` et dans un sous-dossier, avec conservation du type MIME et du
  cache ;
- JPG et PNG validés à la racine et dans des sous-dossiers, y compris une image relative sous une règle de package ;
- refus validé pour SCSS, JavaScript, TypeScript, SVG et WOFF2, avec comparaison au comportement natif de Fastify ;
- cible installée dans un autre package `@itrocks` validée sans modification de `@itrocks/fastify`.

### SKIN-S040 — Stabilisation

- `npm test` : 29 tests réussis, avec configuration fusionnée d’un package de skin autonome et d’une surcharge exacte
  applicative, validation du skin complet, rendu HTML et composition du bootstrap ;
- exemples fournis pour une application minimale et un package de skin autonome ;
- diagnostic désactivé par défaut, activable par configuration ou callback structuré ;
- compatibilité validée avec Node.js 24.19.0, TypeScript 7.0.2, Fastify 5.12.0, `@itrocks/fastify` 0.2.7 et
  `@itrocks/template` 0.2.3 ;
- `npm pack --dry-run --json` : seuls la configuration, la documentation utilisateur, la licence, le JavaScript
  compilé et les déclarations sont publiés ; sources, tests, maps, exemples et caches sont absents.

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

SKIN-S020 et SKIN-S030 ont été développées séparément après SKIN-S010. SKIN-S040 a ensuite stabilisé et validé
l’ensemble des intégrations.

## Décisions retenues

Les décisions détaillées et leurs motivations restent consignées dans chaque spécification :

```text
SKIN-S010-Q1 : stricte.
SKIN-S020-Q1 : contexte du remplacement.
SKIN-S030-Q1 : composition sans hook Fastify.
```
