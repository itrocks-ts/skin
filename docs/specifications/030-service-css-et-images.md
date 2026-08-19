# SKIN-S030 — Service transparent des CSS et images finales

| Propriété                      | Valeur    |
|--------------------------------|-----------|
| Dépendances                    | SKIN-S010 |
| Niveau de réflexion recommandé | `high`    |

## Résultat attendu

Les URL existantes de CSS, JPG et PNG servent les fichiers de remplacement configurés tout en conservant leur URL
publique, leur type MIME et le pipeline statique de `@itrocks/fastify`.

## Parcours principal

1. Le navigateur demande `/@itrocks/list/list.css` ou une image référencée.
2. `SkinFastifyServer.httpCall()` reconnaît l’une des trois extensions admises.
3. Le résolveur reçoit le chemin final que Fastify aurait servi.
4. La surcharge traduit la cible en chemin statique it.rocks et délègue à `super.httpCall()`.
5. Fastify sert le contenu avec son comportement actuel.

## Règles

- `@itrocks/skin/config.yaml` compose `@itrocks/fastify:FastifyServer` avec `SkinFastifyServer`.
- Seuls `.css`, `.jpg` et `.png` sont interceptés par cette intégration.
- Un CSS final peut être à la racine, sous `css/`, sous `cjs/` ou dans un sous-dossier.
- Une règle de package conserve le chemin relatif réel du CSS ou de l’image sous la cible.
- Une règle de package couvre donc une image relative référencée par un HTML ou un CSS remplacé.
- Une règle CSS exacte ne déduit aucune règle pour ses images.
- Une image exacte conserve son chemin relatif complet dans la clé source.
- Les autres extensions, notamment `.scss`, `.js`, `.svg` et `.woff2`, restent inchangées.
- La découverte des scripts front et `frontScripts` reste entièrement déléguée au serveur d’origine.

## Critères d’acceptation

1. **Étant donné** le remplacement exact d’un CSS final, **quand** son URL d’origine est demandée, **alors** la cible
   est retournée en `text/css`.
2. **Étant donné** une règle de package et `css/theme.css`, **quand** ce CSS est demandé, **alors** la cible conserve
   `css/theme.css`.
3. **Étant donné** cette règle et `css/background.jpg`, **quand** l’image relative est demandée, **alors** la cible
   conserve `css/background.jpg`.
4. **Étant donné** une image `images/avatar.png`, **quand** une règle exacte la remplace, **alors** la cible configurée
   est servie en `image/png`.
5. **Étant donné** une requête SCSS, JavaScript, SVG ou WOFF2, **quand** une règle de package correspond, **alors**
   aucun remplacement ne s’applique.
6. **Étant donné** une ressource non configurée, **quand** elle est demandée, **alors** la réponse est identique à celle
   du `FastifyServer` d’origine.

## Validation attendue

- Tests HTTP sur CSS à la racine, sous `css/`, sous `cjs/` et dans un sous-dossier.
- Tests HTTP sur JPG et PNG à la racine et dans des sous-dossiers.
- Test d’une image relative à un CSS sous une règle de package.
- Tests de refus de SCSS, JS, TS, SVG et WOFF2.
- Tests de conservation des types MIME, statuts et URL publiques.
- Test de composition chargé par le bootstrap réel du framework.

## Hors périmètre

- Compilation ou service de SCSS.
- Réécriture du contenu CSS ou des `url(...)`.
- Remplacement implicite des images d’un CSS remplacé par une règle exacte.
- CDN, cache distribué ou stockage externe.

## Question bloquante

### SKIN-S030-Q1 — Faut-il modifier `@itrocks/fastify` dès la première version ?

**Options identifiées :**

1. Composer `FastifyServer` et réécrire le chemin avant de déléguer à `super.httpCall()`.
2. Ajouter d’abord un callback optionnel `resolveAssetPath` à `FastifyConfig`.

**Recommandation :** option 1. Elle n’impose aucun changement de package. L’option 2 reste le repli si les tests
montrent que la délégation ne préserve pas tous les comportements.

**Décision :** À définir.
