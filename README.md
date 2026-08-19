[![npm version](https://img.shields.io/npm/v/@itrocks/skin?logo=npm)](https://www.npmjs.org/package/@itrocks/skin)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/skin)](https://www.npmjs.org/package/@itrocks/skin)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/skin?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/skin)
[![issues](https://img.shields.io/github/issues/itrocks-ts/skin)](https://github.com/itrocks-ts/skin/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# skin

Enables it.rocks applications to be skinned with custom templates, styles, and images.

## Status

The deterministic resolver validates file-specific and package-wide skin rules. The composed runtime integrations
transparently replace final HTML templates, CSS stylesheets, and JPG or PNG images while preserving their public paths
and native template or HTTP handling. The package is validated and ready for use; implementation evidence is tracked
in [the development plan](docs/README.md).

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

### Package skins and application overrides

A standalone skin package depends on `@itrocks/skin`, publishes its replacement tree, and contributes a package rule:

```yaml
# @demo/blue-skin/config.yaml
skin:
  '@itrocks/home': ./content
```

The replacement tree mirrors every eligible final artifact from `@itrocks/home`, including build directories:

```text
content/
└── cjs/
    ├── container.html
    └── output.html
```

An application can keep that package skin and override one published artifact. Application configuration is loaded
last by `@itrocks/config`, and the exact rule has priority over the package rule:

```yaml
# application config.yaml
skin:
  '@itrocks/home/output.html': ./output.html
```

Copyable configuration layouts are available in [the minimal application](examples/application) and
[the standalone skin package](examples/package-skin).

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

Validation issues contain a stable `code`, the offending `rule`, and an actionable `message`. Applications should
fail bootstrap when `valid` is false rather than accepting traffic with an incomplete package skin.

## Diagnostics

Runtime diagnostics are disabled by default. Enable them explicitly in application configuration when investigating
a resolution:

```yaml
skinDiagnostics: true
```

The composed template and Fastify integrations then write one debug entry per eligible resolution, including its
resource kind, logical path, and replacement or unchanged outcome. Disable the flag after diagnosis because physical
target paths are intentionally included.

Library callers can collect structured events without console output:

```ts
const resolver = new SkinResolver(config.skin ?? {}, appDir, {
	diagnostic: event => audit.push(event)
})
```

## Runtime integration

The package composes `@itrocks/template:Template` with its skin-aware implementation through `config.yaml`. It resolves
the requested final template and optional container, then delegates parsing unchanged to `Template`. Includes inherit
the composed class, relative includes use the replacement directory, and collected head dependencies keep the native
template-engine behaviour.

The composed `SkinFastifyServer` intercepts only final `.css`, `.jpg`, and `.png` requests. It resolves their physical
replacement, translates it back to an it.rocks static path, and delegates the response to Fastify. Public URLs, MIME
types, caching statuses, missing-file responses, and unconfigured assets therefore retain the native server behaviour.

Package rules preserve the complete published path, including images referenced relative to a replaced CSS file. An
exact CSS rule does not infer image replacements; each image needs its own exact rule. SCSS, JavaScript, TypeScript,
SVG, WOFF2, and front-script discovery remain untouched.

The dedicated integration subpaths avoid circular facade loading.

The base configuration also seeds an empty `skin` object before dependent skin packages are merged. This lets
`@itrocks/config` rebase their nested `./...` target paths against the declaring package.

## Compatibility

The release is validated against the package's current runtime stack:

| Component | Supported | Validated |
|-----------|-----------|-----------|
| Node.js | `>=24` | 24.19.0 |
| TypeScript | `^7.0` | 7.0.2 |
| Fastify | 5.x | 5.12.0 through `@itrocks/fastify` 0.2.7 |
| Template engine | current `@itrocks/template` | 0.2.3 |

## Development

Run the complete resolver, template, HTTP, merged-configuration, and bootstrap suite:

```bash
npm test
```

Inspect the publication allow-list before publishing:

```bash
npm pack --dry-run --json
```

The archive contains `config.yaml`, the README, license, compiled JavaScript, and declarations. TypeScript sources,
tests, source maps, examples, documentation sources, and caches are excluded.
