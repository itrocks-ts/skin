# SKIN-S010 — Résolution déterministe des artefacts finaux

| Propriété                      | Valeur |
|--------------------------------|--------|
| Dépendances                    | Aucune |
| Niveau de réflexion recommandé | `high` |

## Résultat attendu

Une API indépendante de Fastify et du moteur de gabarits résout un artefact final publié vers son remplacement, avec
une priorité stable, une validation explicite et aucun accès hors des racines autorisées.

## Configuration

```yaml
skin:
  '@itrocks/home': /app/home
  '@itrocks/list/feed.html': /app/list/my-feed.html
```

Le contrat TypeScript accepte un `Record<string, string>`. Plusieurs packages peuvent contribuer des clés différentes ;
pour une clé identique, la valeur finale fusionnée par `@itrocks/config` fait autorité.

## Artefacts admissibles

- `.html` final lu par `Template`, qu’il soit à la racine, sous `html/`, sous `cjs/` ou plus profondément ;
- `.css` final servi par Fastify, qu’il soit à la racine, sous `css/`, sous `cjs/` ou plus profondément ;
- `.jpg` et `.png` finaux servis par Fastify, quel que soit leur sous-dossier publié.

Tout chemin sous `src/` est refusé, même si son extension est admissible. Les `.scss` ne sont jamais considérés.

## Règles de résolution

- Une règle exacte sur le chemin publié complet est prioritaire.
- Un HTML sous `html/` ou `cjs/` possède aussi un alias sans ce premier dossier.
- Un CSS sous `css/` ou `cjs/` possède aussi un alias sans ce premier dossier.
- Une image ne retire aucun dossier de son identifiant exact.
- Un alias ambigu entre plusieurs artefacts publiés est invalide.
- Une règle de package conserve exactement le chemin relatif réel sous la cible.
- Une règle de namespace essaie le chemin avec le namespace source, puis le chemin limité au nom du package source.
- Une règle de dossier est partielle : une ressource absente de la cible retombe sur l’original sans erreur.
- Une cible `/...` est relative à `appDir`.
- Une cible `./...` est déjà devenue absolue après la fusion de `@itrocks/config`.
- Une cible de dossier `@scope/package` désigne un package installé.
- Une cible de dossier `@scope` désigne le dossier de namespace correspondant sous `node_modules`.
- Une cible n’est jamais réinjectée comme nouvelle source.
- Les traversées de dossiers et sorties des racines autorisées sont refusées.

## API anticipée

```ts
export type SkinResourceKind = 'image' | 'style' | 'template'

export type SkinResolution = {
	found:        boolean
	logical:      string
	original:     string
	replacement?: string
}

export class SkinResolver
{
	constructor(config: SkinConfig, appDir: string)
	resolve(file: string, kind: SkinResourceKind): SkinResolution
	validate(): Promise<SkinValidationResult>
}
```

Les noms définitifs pourront être ajustés, mais la séparation entre résolution et lecture du fichier est obligatoire.

## Critères d’acceptation

1. **Étant donné** `cjs/feed.html`, **quand** `@itrocks/list/feed.html` est configuré, **alors** l’alias correspond.
2. **Étant donné** une règle exacte et une règle de package, **quand** le fichier est résolu, **alors** l’exacte gagne.
3. **Étant donné** `css/theme.css` sous une règle de package ciblant `/app/skin`, **quand** il est résolu, **alors** la
   cible est `/app/skin/css/theme.css`.
4. **Étant donné** `images/photo.jpg` sous cette même règle, **quand** il est résolu, **alors** la cible est
   `/app/skin/images/photo.jpg`.
5. **Étant donné** un fichier sous `src/`, **quand** il est présenté au résolveur, **alors** aucun remplacement ne
   s’applique.
6. **Étant donné** deux fichiers produisant le même alias, **quand** la configuration est validée, **alors** un chemin
   complet est exigé.
7. **Étant donné** une traversée de dossier, **quand** la configuration est validée, **alors** elle est refusée avec la
   règle concernée.
8. **Étant donné** un artefact absent de la cible d’une règle de package, **quand** il est résolu, **alors** l’original
   est conservé sans erreur.
9. **Étant donné** `@itrocks` ciblant un dossier, **quand** `@itrocks/home/cjs/page.html` est résolu, **alors** les
   dispositions `@itrocks/home/cjs/page.html` puis `home/cjs/page.html` sont essayées.
10. **Étant donné** une règle de namespace ciblant un package ou un dossier de namespace installé, **quand** une
    ressource est résolue, **alors** la même liste de chemins relatifs est recherchée sous cette cible.

## Validation attendue

- Tests sur racine, `html/`, `css/`, `cjs/` et sous-dossiers imbriqués.
- Tests des quatre extensions admises et du refus de `src/`, `.scss`, `.js` et `.svg`.
- Tests de priorité entre chemin complet, alias, package et namespace.
- Tests du fallback de dossier et des cibles package et namespace installées.
- Tests de sécurité sur `..`, séparateurs mixtes et liens symboliques.
- Tests de configuration issue d’un package et de l’application.

## Hors périmètre

- Lecture ou rendu HTML.
- Service HTTP.
- Compilation ou résolution SCSS.
- Remplacement de JavaScript ou d’autres extensions.

## Question bloquante

### SKIN-S010-Q1 — Une règle de package est-elle stricte ?

**Options identifiées :**

1. Un artefact demandé mais absent de la cible provoque une erreur explicite.
2. Un artefact absent de la cible retombe silencieusement sur le package d’origine.

**Recommandation initiale :** option 1. Une règle de package signifiait que son arborescence finale était remplacée.

**Décision révisée :** option 2. Une règle de dossier, de package ou de namespace est partielle. Chaque artefact absent
de la cible retombe silencieusement sur l’original. Une règle de fichier reste stricte car elle désigne explicitement
un fichier cible.
