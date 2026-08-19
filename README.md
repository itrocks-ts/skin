[![npm version](https://img.shields.io/npm/v/@itrocks/skin?logo=npm)](https://www.npmjs.org/package/@itrocks/skin)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/skin)](https://www.npmjs.org/package/@itrocks/skin)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/skin?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/skin)
[![issues](https://img.shields.io/github/issues/itrocks-ts/skin)](https://github.com/itrocks-ts/skin/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# skin

Enables it.rocks applications to be skinned with custom templates, styles, and images.

## Status

The deterministic resolver validates file-specific and package-wide skin rules. Final HTML templates are transparently
resolved through the composed `SkinTemplate`, including action templates, containers, and relative includes. The
Fastify integration remains a no-op composition point until CSS and image serving is implemented. The remaining work
is tracked in [the development plan](docs/README.md).

## Installation

```bash
npm i @itrocks/skin
```

Applications declare package-wide and file-specific replacements in the `skin` section of their `config.yaml`, or in
the `config.yaml` of a package that contributes a skin. The framework merges package and application configuration
through `@itrocks/config`.

YAML keys beginning with `@` must be quoted:

```yaml
skin:
  '@itrocks/home': /app/home
  '@itrocks/list/feed.html': /app/list/my-feed.html
```

Only final `.html`, `.css`, `.jpg`, and `.png` files used at runtime are eligible. Authoring files under `src/` and
SCSS sources are outside this package's responsibility.

Paths beginning with `/` will be relative to the application root. Paths beginning with `./` will keep the existing
`@itrocks/config` behaviour and be resolved relative to the package that declares them.

## Resolver

Create the resolver from the merged `skin` configuration, validate it once during bootstrap, then resolve final files
before reading or serving them:

```ts
import { appDir }       from '@itrocks/app-dir'
import { config }       from '@itrocks/config'
import { SkinResolver } from '@itrocks/skin'

const resolver   = new SkinResolver(config.skin ?? {}, appDir)
const validation = await resolver.validate()

if (!validation.valid) {
	throw new Error(validation.issues.map(issue => issue.message).join('\n'))
}

const resolution = resolver.resolve(templateFile, 'template')
const file        = resolution.replacement ?? resolution.original
```

`resolve()` accepts `template`, `style`, and `image` resources. It ignores files under `src/` and unsupported
extensions. Exact published paths win over build-directory aliases, which win over package rules. Package rules are
strict: validation fails when an eligible target artifact is missing, unless a file-specific rule overrides it.

Targets and source rules containing traversal or mixed separators are rejected. Validation also resolves symbolic
links and rejects any source or target that escapes its allowed package or application root.

## Template integration

The package composes `@itrocks/template:Template` with its skin-aware implementation through `config.yaml`. It resolves
the requested final template and optional container, then delegates parsing unchanged to `Template`. Includes inherit
the composed class, relative includes use the replacement directory, and collected head dependencies keep the native
template-engine behaviour.

`@itrocks/fastify:FastifyServer` is also composed through the dedicated `@itrocks/skin/fastify` subpath, but remains a
no-op until the CSS and image integration step. The dedicated subpaths avoid circular facade loading.

The base configuration also seeds an empty `skin` object before dependent skin packages are merged. This lets
`@itrocks/config` rebase their nested `./...` target paths against the declaring package.
