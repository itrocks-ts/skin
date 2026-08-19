# SKIN-S040 — Stabilisation, compatibilité et documentation

| Propriété                      | Valeur          |
|--------------------------------|-----------------|
| Dépendances                    | SKIN-S020, S030 |
| Niveau de réflexion recommandé | `medium`        |

## Résultat attendu

Le package est publiable, documenté et validé sur quatre cas représentatifs : remplacement ponctuel, skin de package
complet, package de skin autonome et surcharge applicative au-dessus de ce package.

## Dans le périmètre

- README anglais conforme aux conventions des packages `@itrocks`.
- Documentation française de l’architecture et des décisions.
- Exemple minimal d’application et exemple de package de skin.
- Fixtures couvrant les artefacts finaux à la racine, sous `html/`, `css/`, `cjs/` et dans des sous-dossiers.
- Matrice de compatibilité Node.js 24, TypeScript 7, Fastify et moteur de gabarits courants.
- Tests d’intégration avec le bootstrap réel de `@itrocks/framework`.
- Vérification du contenu publié par `npm pack --dry-run`.
- Messages d’erreur actionnables et journal de diagnostic activable explicitement.

## Critères d’acceptation

1. **Étant donné** le package sans clé `skin`, **quand** l’application sert ses pages, **alors** aucun résultat
   observable ne change.
2. **Étant donné** un package de skin et une règle exacte applicative, **quand** les configurations sont fusionnées,
   **alors** la règle exacte applicative gagne sur la règle de package.
3. **Étant donné** un skin complet, **quand** ses HTML, CSS, JPG et PNG sont demandés, **alors** chaque cible conserve
   le chemin relatif publié.
4. **Étant donné** des fichiers SCSS ou HTML sous `src/`, **quand** le package est validé, **alors** ils ne participent
   à aucune résolution.
5. **Étant donné** `npm pack --dry-run`, **quand** le contenu est inspecté, **alors** tous les fichiers runtime requis
   sont présents et les sources, tests, maps et caches sont absents.

## Validation attendue

- `npm test`.
- `npm pack --dry-run`.
- Démarrage d’une application exemple avec et sans skin.
- Requêtes directes sur une page, un fragment, un CSS, un JPG et un PNG.
- Validation HTML et contrôle des styles et images chargés.

## Définition de terminé

- Toutes les spécifications précédentes sont `done` avec leurs preuves.
- La documentation décrit uniquement les comportements effectivement livrés.
- Aucune modification de framework non justifiée par les preuves de SKIN-S030 n’a été introduite.
- Le package peut être installé sans dépendance transitive accidentelle.

## Questions bloquantes

Aucune.
