[![npm version](https://img.shields.io/npm/v/@itrocks/skin?logo=npm)](https://www.npmjs.org/package/@itrocks/skin)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/skin)](https://www.npmjs.org/package/@itrocks/skin)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/skin?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/skin)
[![issues](https://img.shields.io/github/issues/itrocks-ts/skin)](https://github.com/itrocks-ts/skin/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# skin

Enables it.rocks applications to be skinned with custom templates, styles, and images.

## Bootstrap status

This repository currently contains the package skeleton and no-op integration classes. Installing it preserves the
original template and asset behaviour. The proposed replacement contract and implementation plan are documented in
[the development plan](docs/README.md).

## Installation

```bash
npm i @itrocks/skin
```

Once the planned specifications are implemented, applications will be able to declare package-wide and file-specific
replacements. In an application built with `@itrocks/framework`, add the `skin` section to the application's
`config.yaml` or to the `config.yaml` of a package that contributes a skin. The framework merges package and application
configuration through `@itrocks/config`.

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

## Integration

The package contributes no-op subclasses for `@itrocks/template:Template` and
`@itrocks/fastify:FastifyServer` through its `config.yaml`. Their dedicated `@itrocks/skin/template` and
`@itrocks/skin/fastify` integration subpaths avoid circular facade loading. This establishes the intended composition
points without changing `@itrocks/framework`, `@itrocks/template`, or `@itrocks/fastify`.

The base configuration also seeds an empty `skin` object before dependent skin packages are merged. This lets
`@itrocks/config` rebase their nested `./...` target paths against the declaring package.
