# SKIN-S020 — Remplacement transparent des gabarits HTML finaux

| Propriété                      | Valeur    |
|--------------------------------|-----------|
| Dépendances                    | SKIN-S010 |
| Niveau de réflexion recommandé | `high`    |

## Résultat attendu

Les gabarits d’action, containers et includes HTML finaux sont lus depuis leur remplacement sans modifier les actions,
les routes, le framework ou le package propriétaire du gabarit.

## Parcours principal

1. Une action appelle `htmlTemplateResponse()` avec un fichier final publié par son package.
2. Le framework instancie la classe `Template` composée, donc `SkinTemplate`.
3. `SkinTemplate.parseFile()` résout le gabarit et le container.
4. Le moteur existant analyse le fichier retenu avec le même contexte et les mêmes traductions.
5. Les includes passent à leur tour par la même classe composée.

## Règles

- `@itrocks/skin/config.yaml` compose `@itrocks/template:Template` avec `SkinTemplate`.
- La surcharge résout les chemins puis délègue à `super.parseFile()`.
- Tout fichier sous `src/` est ignoré ; seuls les chemins finaux effectivement lus sont interceptés.
- Une règle exacte peut écrire `@itrocks/list/feed.html` pour le fichier final `cjs/feed.html`.
- Une règle de package conserve `cjs/`, `html/` ou tout autre sous-dossier dans le chemin cible.
- Un chemin relatif du gabarit remplacé est relatif au dossier du remplacement.
- Une ressource d’origine reste réutilisable par un include absolu `/@itrocks/...`.
- Les erreurs mentionnent la règle et la cible sans exposer de chemin sensible au client.

## Critères d’acceptation

1. **Étant donné** le remplacement de `@itrocks/list/feed.html`, **quand** la liste est rendue, **alors** seul le
   `cjs/feed.html` final est remplacé.
2. **Étant donné** une règle de package et `cjs/container.html`, **quand** le container est rendu, **alors** le moteur
   lit `cjs/container.html` sous la cible.
3. **Étant donné** un HTML final publié à la racine, **quand** il est rendu, **alors** son remplacement est recherché
   à la racine de la cible.
4. **Étant donné** un fichier HTML sous `src/`, **quand** il existe aussi dans le dépôt du package, **alors** il n’est
   jamais choisi par le résolveur.
5. **Étant donné** une navigation complète ou partielle, **quand** le remplacement déclare des dépendances de head,
   **alors** leur collecte continue de fonctionner.

## Validation attendue

- Tests d’intégration avec `Template` et `@itrocks/compose`.
- Tests à la racine, sous `html/`, sous `cjs/` et dans un sous-dossier imbriqué.
- Tests d’un gabarit direct, d’un container et d’un include.
- Test de non-régression sans configuration `skin`.
- Validation HTML d’un document complet et d’un fragment.

## Hors périmètre

- Fichiers HTML sources sous `src/`.
- Transformation ou fusion automatique de HTML.
- Réécriture des données préparées par une action.

## Question bloquante

### SKIN-S020-Q1 — Quel contexte employer pour les chemins relatifs ?

**Options identifiées :**

1. Le dossier du gabarit de remplacement.
2. Le dossier du gabarit d’origine.

**Recommandation :** option 1, qui respecte le comportement natif de `Template`. La conservation de l’arborescence par
une règle de package permet de recopier les mêmes includes relatifs ; un original reste accessible par chemin absolu.

**Décision :** option 1. Les chemins relatifs sont résolus depuis le dossier du gabarit de remplacement, conformément
au comportement natif de `Template`.
