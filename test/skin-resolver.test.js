const assert = require('node:assert/strict')
const fs     = require('node:fs')
const os     = require('node:os')
const path   = require('node:path')
const test   = require('node:test')

const { SkinResolutionError, SkinResolver } = require('../cjs/skin')

function createFile(file, content = file)
{
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
	return file
}

function fixture(context)
{
	const appDir      = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-'))
	const packageRoot = path.join(appDir, 'node_modules', '@demo', 'content')
	createFile(path.join(packageRoot, 'package.json'), '{"name":"@demo/content"}')
	context.after(() => fs.rmSync(appDir, { force: true, recursive: true }))
	return {
		appDir,
		file: relative => createFile(path.join(packageRoot, ...relative.split('/'))),
		packageRoot,
		target: (relative, content) => createFile(path.join(appDir, ...relative.split('/')), content)
	}
}

test('resolves root, build-directory and nested aliases for templates and styles', async context => {
	const app = fixture(context)
	const cjsTemplate    = app.file('cjs/views/feed.html')
	const htmlTemplate   = app.file('html/pages/card.html')
	const cjsStyle       = app.file('cjs/admin.css')
	const cssStyle       = app.file('css/themes/main.css')
	const rootTemplate   = app.file('home.html')
	const rootStyle      = app.file('print.css')
	const templateTarget = app.target('skin/feed.html')
	const htmlTarget     = app.target('skin/card.html')
	const cjsStyleTarget = app.target('skin/admin.css')
	const styleTarget    = app.target('skin/main.css')
	const rootTarget     = app.target('skin/home.html')
	const rootStyleTarget = app.target('skin/print.css')
	const resolver = new SkinResolver({
		'@demo/content/admin.css':       '/skin/admin.css',
		'@demo/content/home.html':       '/skin/home.html',
		'@demo/content/pages/card.html': '/skin/card.html',
		'@demo/content/print.css':       '/skin/print.css',
		'@demo/content/themes/main.css': '/skin/main.css',
		'@demo/content/views/feed.html': '/skin/feed.html'
	}, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(cjsTemplate, 'template').replacement, templateTarget)
	assert.equal(resolver.resolve(htmlTemplate, 'template').replacement, htmlTarget)
	assert.equal(resolver.resolve(cjsStyle, 'style').replacement, cjsStyleTarget)
	assert.equal(resolver.resolve(cssStyle, 'style').replacement, styleTarget)
	assert.equal(resolver.resolve(rootTemplate, 'template').replacement, rootTarget)
	assert.equal(resolver.resolve(rootStyle, 'style').replacement, rootStyleTarget)
})

test('gives a complete file rule priority over its alias and package rule', async context => {
	const app = fixture(context)
	const source = app.file('cjs/feed.html')
	app.target('skin/package/cjs/feed.html')
	app.target('skin/alias.html')
	const exact = app.target('skin/exact.html')
	const resolver = new SkinResolver({
		'@demo/content':               '/skin/package',
		'@demo/content/cjs/feed.html': '/skin/exact.html',
		'@demo/content/feed.html':     '/skin/alias.html'
	}, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.deepEqual(resolver.resolve(source, 'template'), {
		found:       true,
		logical:     '@demo/content/cjs/feed.html',
		original:    source,
		replacement: exact
	})
})

test('keeps the complete published path for package rules', async context => {
	const app = fixture(context)
	const style = app.file('css/themes/theme.css')
	const jpg   = app.file('images/photo.jpg')
	const png   = app.file('cjs/images/avatar.png')
	const targetStyle = app.target('skin/package/css/themes/theme.css')
	const targetJpg   = app.target('skin/package/images/photo.jpg')
	const targetPng   = app.target('skin/package/cjs/images/avatar.png')
	const resolver = new SkinResolver({ '@demo/content': '/skin/package' }, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(style, 'style').replacement, targetStyle)
	assert.equal(resolver.resolve(jpg, 'image').replacement, targetJpg)
	assert.equal(resolver.resolve(png, 'image').replacement, targetPng)
})

test('lets exact application rules override a partial package skin', async context => {
	const app = fixture(context)
	const feed = app.file('cjs/feed.html')
	const logo = app.file('images/logo.png')
	app.target('skin/package/images/logo.png')
	const applicationFeed = app.target('application/feed.html')
	const resolver = new SkinResolver({
		'@demo/content':               '/skin/package',
		'@demo/content/cjs/feed.html': '/application/feed.html'
	}, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(feed, 'template').replacement, applicationFeed)
	assert.equal(resolver.resolve(logo, 'image').logical, '@demo/content/images/logo.png')
})

test('does not replace sources or unsupported final extensions', async context => {
	const app = fixture(context)
	const sourceHtml = app.file('src/feed.html')
	const scss       = app.file('css/theme.scss')
	const script     = app.file('cjs/app.js')
	const vector     = app.file('images/logo.svg')
	fs.mkdirSync(path.join(app.appDir, 'skin', 'package'), { recursive: true })
	const resolver = new SkinResolver({ '@demo/content': '/skin/package' }, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	for (const [file, kind] of [
		[sourceHtml, 'template'],
		[scss, 'style'],
		[script, 'style'],
		[vector, 'image']
	]) {
		assert.equal(resolver.resolve(file, kind).found, false)
	}
})

test('preserves a supported final artifact when no skin rule is configured', async context => {
	const app      = fixture(context)
	const template = app.file('cjs/feed.html')
	const resolver = new SkinResolver({}, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.deepEqual(resolver.resolve(template, 'template'), {
		found:    false,
		logical:  '@demo/content/cjs/feed.html',
		original: template
	})
})

test('emits structured diagnostics only when a callback is explicitly configured', async context => {
	const app      = fixture(context)
	const original = app.file('cjs/feed.html')
	const target   = app.target('skin/feed.html')
	const events   = []
	const resolver = new SkinResolver(
		{ '@demo/content/feed.html': '/skin/feed.html' },
		app.appDir,
		{ diagnostic: event => events.push(event) }
	)

	resolver.resolve(original, 'template')

	assert.deepEqual(events, [{
		candidates: [target],
		final: target,
		found: true,
		kind: 'template',
		logical: '@demo/content/cjs/feed.html',
		original,
		replacement: target,
		rule: {
			source: '@demo/content/feed.html',
			target: '/skin/feed.html'
		}
	}])
	assert.doesNotThrow(() => new SkinResolver({}, app.appDir).resolve(original, 'template'))
})

test('requires a complete path when a build-directory alias is ambiguous', async context => {
	const app = fixture(context)
	app.file('cjs/feed.html')
	app.file('html/feed.html')
	app.target('skin/feed.html')
	const resolver = new SkinResolver({ '@demo/content/feed.html': '/skin/feed.html' }, app.appDir)
	const validation = await resolver.validate()

	assert.equal(validation.valid, false)
	assert.deepEqual(validation.issues.map(issue => issue.code), ['AMBIGUOUS_ALIAS'])
	assert.throws(
		() => resolver.resolve(path.join(app.packageRoot, 'cjs', 'feed.html'), 'template'),
		error => (error instanceof SkinResolutionError) && (error.code === 'AMBIGUOUS_ALIAS')
	)
})

test('treats a root artifact as exact instead of also applying its key as an alias', async context => {
	const app = fixture(context)
	const root = app.file('feed.html')
	const cjs  = app.file('cjs/feed.html')
	const target = app.target('skin/feed.html')
	const resolver = new SkinResolver({ '@demo/content/feed.html': '/skin/feed.html' }, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(root, 'template').replacement, target)
	assert.equal(resolver.resolve(cjs, 'template').found, false)
})

test('reports every malformed or unsupported configuration rule deterministically', async context => {
	const app = fixture(context)
	const theme = app.file('theme.css')
	const resolver = new SkinResolver({
		'@demo/content/../feed.html': '/skin/feed.html',
		'@demo/content/feed.js':     '/skin/feed.js',
		'@demo/content/other.css':   '/skin\\other.css',
		'@demo/content/theme.css':   '/skin/../outside.css',
		'@demo\\content/feed.html': '/skin/feed.html'
	}, app.appDir)
	const validation = await resolver.validate()

	assert.equal(validation.valid, false)
	assert.deepEqual(validation.issues.map(issue => issue.code), [
		'INVALID_RULE',
		'UNSUPPORTED_RESOURCE',
		'INVALID_TARGET',
		'INVALID_TARGET',
		'INVALID_RULE'
	])
	assert.throws(
		() => resolver.resolve(theme, 'style'),
		error => (error instanceof SkinResolutionError) && (error.code === 'INVALID_TARGET')
	)
})

test('supports a locally installed package represented by a root symbolic link', async context => {
	const appDir      = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-app-'))
	const localRoot   = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-package-'))
	const packageLink = path.join(appDir, 'node_modules', '@demo', 'content')
	context.after(() => fs.rmSync(appDir, { force: true, recursive: true }))
	context.after(() => fs.rmSync(localRoot, { force: true, recursive: true }))
	createFile(path.join(localRoot, 'package.json'), '{"name":"@demo/content"}')
	const source = createFile(path.join(localRoot, 'cjs', 'feed.html'))
	fs.mkdirSync(path.dirname(packageLink), { recursive: true })
	fs.symlinkSync(localRoot, packageLink, 'dir')
	const target = createFile(path.join(appDir, 'skin', 'feed.html'))
	const resolver = new SkinResolver({ '@demo/content/feed.html': '/skin/feed.html' }, appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(path.join(packageLink, 'cjs', 'feed.html'), 'template').replacement, target)
	assert.equal(fs.realpathSync(source), source)
})

test('falls back to the original artifact when it is missing from a package target', async context => {
	const app = fixture(context)
	const original = app.file('css/theme.css')
	fs.mkdirSync(path.join(app.appDir, 'skin', 'package'), { recursive: true })
	const events   = []
	const resolver = new SkinResolver(
		{ '@demo/content': '/skin/package' },
		app.appDir,
		{ diagnostic: event => events.push(event) }
	)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.deepEqual(resolver.resolve(original, 'style'), {
		found: false,
		logical: '@demo/content/css/theme.css',
		original
	})
	assert.deepEqual(events[0], {
		candidates: [path.join(app.appDir, 'skin/package/css/theme.css')],
		final: original,
		found: false,
		kind: 'style',
		logical: '@demo/content/css/theme.css',
		original,
		rule: { source: '@demo/content', target: '/skin/package' }
	})
})

test('resolves namespace rules with namespaced then package-only layouts and an original fallback', async context => {
	const app         = fixture(context)
	const template    = app.file('cjs/page.html')
	const style       = app.file('css/theme.css')
	const image       = app.file('images/logo.png')
	const namespaced  = app.target('skin/@demo/content/cjs/page.html')
	app.target('skin/content/cjs/page.html')
	const packageOnly = app.target('skin/content/css/theme.css')
	const resolver    = new SkinResolver({ '@demo': '/skin' }, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(template, 'template').replacement, namespaced)
	assert.equal(resolver.resolve(style, 'style').replacement, packageOnly)
	assert.deepEqual(resolver.resolve(image, 'image'), {
		found: false,
		logical: '@demo/content/images/logo.png',
		original: image
	})
})

test('accepts an installed package or package namespace as a namespace target', async context => {
	const app           = fixture(context)
	const template      = app.file('cjs/page.html')
	app.target('node_modules/@my/skin/package.json', '{"name":"@my/skin"}')
	const packageTarget = app.target('node_modules/@my/skin/content/cjs/page.html')
	let resolver        = new SkinResolver({ '@demo': '@my/skin' }, app.appDir)

	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(template, 'template').replacement, packageTarget)

	const namespaceTarget = app.target('node_modules/@myappnamespace/content/cjs/page.html')
	resolver = new SkinResolver({ '@demo': '@myappnamespace' }, app.appDir)
	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(resolver.resolve(template, 'template').replacement, namespaceTarget)
})

test('reports a configuration rule for a package that is not installed', async context => {
	const app = fixture(context)
	const validation = await new SkinResolver({
		'@demo/missing/feed.html': '/skin/feed.html'
	}, app.appDir).validate()

	assert.equal(validation.valid, false)
	assert.deepEqual(validation.issues.map(issue => issue.code), ['PACKAGE_NOT_FOUND'])
})

test('rejects source and target symbolic links that escape their allowed roots', async context => {
	const app = fixture(context)
	const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-outside-'))
	context.after(() => fs.rmSync(outside, { force: true, recursive: true }))
	createFile(path.join(outside, 'feed.html'))
	fs.symlinkSync(path.join(outside, 'feed.html'), path.join(app.packageRoot, 'feed.html'))
	app.target('skin/source-target.html')
	const sourceValidation = await new SkinResolver({
		'@demo/content/feed.html': '/skin/source-target.html'
	}, app.appDir).validate()

	assert.deepEqual(sourceValidation.issues.map(issue => issue.code), ['SOURCE_OUTSIDE_ROOT'])

	fs.unlinkSync(path.join(app.packageRoot, 'feed.html'))
	app.file('feed.html')
	fs.mkdirSync(path.join(app.appDir, 'skin'), { recursive: true })
	fs.symlinkSync(outside, path.join(app.appDir, 'skin', 'package'))
	const targetValidation = await new SkinResolver({
		'@demo/content': '/skin/package'
	}, app.appDir).validate()

	assert.deepEqual(targetValidation.issues.map(issue => issue.code), ['TARGET_OUTSIDE_ROOT'])
})
