# Architecture livrée

## Périmètre d’exécution

`@itrocks/skin` ne travaille que sur les artefacts finaux réellement consommés par l’application :

- les gabarits `.html` lus par le moteur de templates ;
- les feuilles `.css` demandées par le navigateur ;
- les images `.jpg` et `.png` référencées par les HTML ou les CSS.

Les fichiers sous `src/`, les `.scss` et tous les autres artefacts de développement sont ignorés. Leur compilation ou
leur copie reste la responsabilité du package qui les possède.

## Constat sur le pipeline actuel

```text
Action.htmlTemplateResponse()
└── Template.parseFile(fichier HTML final)
    ├── gabarit demandé
    ├── container
    └── includes

Navigateur GET /@itrocks/.../fichier.css|jpg|png
└── FastifyServer.httpCall()
    └── assetResponse(fichier final)
```

Le framework charge d’abord la configuration fusionnée, applique `@itrocks/compose`, puis charge ses dépendances et
démarre les serveurs. Les deux classes peuvent donc être remplacées avant leur première utilisation.

## Configuration cible

```yaml
skin:
  '@itrocks/home': /app/home
  '@itrocks/list/feed.html': /app/list/my-feed.html
```

Les guillemets autour des clés sont obligatoires en YAML lorsqu’elles commencent par `@`.

Une cible commençant par `/` est relative à la racine applicative. Une cible commençant par `./` est résolue par
`@itrocks/config` relativement au package qui la déclare :

```yaml
skin:
  '@itrocks/home': ./home
```

Le `config.yaml` de `@itrocks/skin` initialise `skin: {}`. Les packages de skin doivent dépendre de `@itrocks/skin` :
leur configuration est alors fusionnée dans cet objet existant et les cibles `./...` sont correctement rebased.

## Règle de package : conserver l’arborescence publiée

Une clé limitée au nom du package remplace tous ses artefacts admissibles. Le chemin relatif au package source est
conservé tel quel sous le dossier cible.

| Artefact final source                            | Cible pour `@itrocks/home: /app/home` |
|--------------------------------------------------|----------------------------------------|
| `node_modules/@itrocks/home/container.html`      | `/app/home/container.html`             |
| `node_modules/@itrocks/home/cjs/container.html`  | `/app/home/cjs/container.html`         |
| `node_modules/@itrocks/home/html/container.html` | `/app/home/html/container.html`        |
| `node_modules/@itrocks/home/css/app.css`         | `/app/home/css/app.css`                |
| `node_modules/@itrocks/home/images/avatar.jpg`   | `/app/home/images/avatar.jpg`          |

Cette règle ne suppose pas un dossier de build unique. La racine, `cjs/`, `html/`, `css/` et les autres
sous-dossiers publiés restent visibles dans le chemin de remplacement.

## Règle de fichier : forme complète et raccourcis

Une règle exacte peut toujours employer le chemin publié complet :

```yaml
skin:
  '@itrocks/list/cjs/feed.html': /app/list/my-feed.html
```

Pour préserver la forme concise demandée, les HTML et CSS acceptent aussi un alias sans leur premier dossier de build :

- un HTML final sous `cjs/` ou `html/` peut être nommé comme s’il était à la racine ;
- un CSS final sous `css/` ou `cjs/` peut être nommé comme s’il était à la racine.

Ainsi `@itrocks/list/feed.html` peut désigner `@itrocks/list/cjs/feed.html`. Le chemin complet gagne toujours sur un
alias. Si plusieurs artefacts publiés produisent le même alias, la validation refuse l’ambiguïté et demande le chemin
complet.

Pour une image, la règle exacte emploie son chemin relatif publié. Une image située à la racine se note simplement
`@scope/package/photo.jpg`; une image sous `images/` se note `@scope/package/images/photo.jpg`.

## Résolution et priorité

Le résolveur applique les règles suivantes :

1. vérifier que le fichier demandé appartient à un package installé et ne se trouve pas sous `src/` ;
2. calculer son chemin relatif réel depuis la racine du package ;
3. chercher une règle exacte sur le chemin complet ;
4. chercher, pour un HTML ou un CSS, son éventuel alias sans dossier de build ;
5. chercher une règle de package ;
6. pour une règle de package, joindre la cible et le chemin relatif réel sans le transformer ;
7. effectuer une seule substitution et refuser toute traversée de dossier.

Les seules extensions admises dans la première version sont `.html`, `.css`, `.jpg` et `.png`. La casse de l’extension
est normalisée pour la comparaison, sans renommer le fichier physique.

## Intégration HTML

`SkinTemplate` surcharge `parseFile()` et résout le fichier demandé ainsi que le container avant de déléguer à
`Template`. Les includes créent une instance de la même classe composée : ils passent donc eux aussi par le résolveur.

Le contexte des chemins relatifs est celui du gabarit de remplacement. Une règle de package qui conserve
l’arborescence permet aux includes relatifs équivalents de continuer à fonctionner dans le skin. Un gabarit remplacé
peut aussi réutiliser explicitement un original par un include absolu `/@itrocks/...`.

## Intégration CSS et images

`SkinFastifyServer` surcharge `httpCall()` uniquement pour les requêtes `.css`, `.jpg` et `.png`. Il traduit la cible
physique en chemin statique it.rocks, puis délègue à `FastifyServer`. Les types MIME, statuts et erreurs restent
ainsi gérés par le serveur existant.

Sous une règle de package, une URL d’image relative à un CSS continue de fonctionner : le navigateur demande l’URL
d’origine et le résolveur retrouve l’image au même chemin relatif dans le dossier du skin.

Une règle CSS exacte ne remplace pas implicitement ses images. Le CSS de remplacement doit employer une URL absolue ou
chaque image doit disposer de sa propre règle exacte.

## Points de composition

Les classes d’intégration sont publiées par les sous-chemins `@itrocks/skin/template` et `@itrocks/skin/fastify`. Cette
séparation évite que `@itrocks/compose` charge la façade complète pendant qu’une classe de base est encore remplacée.

| Option                            | Avantage                      | Limite                       |
|-----------------------------------|-------------------------------|------------------------------|
| Composer `Template` et Fastify    | Aucun changement du framework | Deux méthodes surchargeables |
| Ajouter des hooks                 | Contrats étroits              | Deux packages à modifier     |
| Surcharger le framework           | Contrôle total                | Composition root dupliqué    |
| Intercepter les lectures globales | Capture toutes les lectures   | Effets de bord incontrôlés   |

La composition est recommandée. Si un hook devient nécessaire, la plus petite évolution acceptable serait un
`resolveAssetPath` optionnel dans `FastifyConfig`; aucune logique de skin n’entrerait dans `@itrocks/fastify`.

## Validation et diagnostic

La validation retourne toutes les anomalies dans un ordre déterministe. Chaque anomalie expose un code stable, la
règle concernée et un message indiquant la source ou la cible à corriger. Une règle de package est validée contre tous
les artefacts finaux admissibles avant le trafic utile.

Le diagnostic reste désactivé par défaut. `skinDiagnostics: true` active, dans les deux intégrations composées, une
trace `debug` pour chaque résolution admissible. L’API du résolveur accepte aussi un callback `diagnostic` afin qu’une
application collecte les mêmes événements structurés sans dépendre de la console.

## Invariants

- Une ressource non configurée conserve exactement son comportement actuel.
- Une règle de package conserve le chemin relatif publié, dossiers de build compris.
- Une règle de fichier exacte peut choisir librement son fichier cible.
- Le remplacement ne change pas l’URL publique de la ressource.
- Les sources, SCSS, JavaScript, TypeScript et extensions non admises ne sont jamais remplacés.
- La configuration est validée avant le premier trafic utile.
- Le package ne dépend pas de `@itrocks/framework`.
