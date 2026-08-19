const assert = require('node:assert/strict')
const fs     = require('node:fs')
const os     = require('node:os')
const path   = require('node:path')
const test   = require('node:test')

const appDirModule     = require('@itrocks/app-dir')
const { config }       = require('@itrocks/config')
const { SkinResolver } = require('../cjs/skin-resolver')
const { SkinTemplate } = require('../cjs/skin-template')

function createFile(file, content)
{
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
	return file
}

function fixture(context, packageName = '@demo/content')
{
	const application    = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-template-'))
	const packageRoot    = path.join(application, 'node_modules', ...packageName.split('/'))
	const previousAppDir = appDirModule.appDir
	const previousSkin   = config.skin
	createFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: packageName }))
	appDirModule.appDir = application
	context.after(() => {
		appDirModule.appDir = previousAppDir
		config.skin         = previousSkin
		fs.rmSync(application, { force: true, recursive: true })
	})
	return {
		application,
		original: (relative, content) => createFile(path.join(packageRoot, ...relative.split('/')), content),
		skin: (relative, content) => createFile(path.join(application, ...relative.split('/')), content)
	}
}

test('renders exact replacements at the root and below published build directories', async context => {
	const app = fixture(context)
	const cases = [
		['page.html',             'skin/root.html',   'ROOT'],
		['cjs/feed.html',         'skin/feed.html',   'CJS'],
		['html/card.html',        'skin/card.html',   'HTML'],
		['cjs/views/detail.html', 'skin/detail.html', 'NESTED']
	]
	config.skin = {}
	for (const [source, target, text] of cases) {
		const original = app.original(source, `<p>ORIGINAL ${text}</p>`)
		app.skin(target, `<p>SKIN ${text}</p>`)
		const logical = source.startsWith('cjs/') || source.startsWith('html/')
			? source.slice(source.indexOf('/') + 1)
			: source
		config.skin[`@demo/content/${logical}`] = '/' + target
		assert.equal(await new SkinTemplate().parseFile(original), `<p>SKIN ${text}</p>`)
	}
})

test('renders a replaced action, container and relative include with collected head dependencies', async context => {
	const app       = fixture(context)
	const action    = app.original('cjs/action.html', '<p>ORIGINAL ACTION</p>')
	const container = app.original('cjs/container.html', '<body>{content}</body>')
	app.original('cjs/partial.html', '<span>ORIGINAL PARTIAL</span>')
	app.skin('skin/cjs/action.html', '<!--BEGIN--><main>{./partial.html}</main><!--END-->')
	app.skin('skin/cjs/container.html',
		'<!DOCTYPE html><html><head><title>Skin</title></head><body>{content}</body></html>')
	app.skin('skin/cjs/partial.html',
		'<!DOCTYPE html><html><head><link href="skin.css" rel="stylesheet"></head>'
		+ '<body><!--BEGIN--><span>SKIN PARTIAL</span><!--END--></body></html>')
	config.skin = { '@demo/content': '/skin' }

	assert.deepEqual(await new SkinResolver(config.skin, app.application).validate(), { issues: [], valid: true })
	const html = await new SkinTemplate().parseFile(action, container)

	assert.match(html, /^<!DOCTYPE html>/)
	assert.match(html, /<main><span>SKIN PARTIAL<\/span><\/main>/)
	assert.match(html, /<link href="\/skin\/cjs\/skin\.css" rel="stylesheet">/)
	assert.doesNotMatch(html, /ORIGINAL/)
})

test('ignores source HTML below src even when a matching rule exists', async context => {
	const app      = fixture(context)
	const original = app.original('src/page.html', '<p>ORIGINAL SOURCE</p>')
	app.skin('skin/page.html', '<p>SKIN SOURCE</p>')
	config.skin = { '@demo/content/src/page.html': '/skin/page.html' }

	assert.equal(await new SkinTemplate().parseFile(original), '<p>ORIGINAL SOURCE</p>')
})

test('preserves native template rendering when no skin is configured', async context => {
	const app      = fixture(context)
	const original = app.original('cjs/page.html', '<p>{message}</p>')
	config.skin    = {}

	assert.equal(await new SkinTemplate({ message: 'ORIGINAL' }).parseFile(original), '<p>ORIGINAL</p>')
})

test('does not feed a replacement in node_modules back into another skin rule', async context => {
	const app      = fixture(context)
	const original = app.original('cjs/page.html', '<p>ORIGINAL PAGE</p>')
	const container = app.original('cjs/container.html', '<main>{content}</main>')
	app.skin('node_modules/@demo/skin/package.json', '{"name":"@demo/skin"}')
	app.skin('node_modules/@demo/skin/page.html', '<p>FIRST REPLACEMENT</p>')
	app.skin('node_modules/@demo/skin/container.html', '<body>{content}</body>')
	app.skin('skin/second.html', '<p>SECOND REPLACEMENT</p>')
	app.skin('skin/second-container.html', '<article>{content}</article>')
	config.skin = {
		'@demo/content/page.html':      '/node_modules/@demo/skin/page.html',
		'@demo/content/container.html': '/node_modules/@demo/skin/container.html',
		'@demo/skin/page.html':         '/skin/second.html',
		'@demo/skin/container.html':    '/skin/second-container.html'
	}

	assert.equal(
		await new SkinTemplate().parseFile(original, container),
		'<body><p>FIRST REPLACEMENT</p></body>'
	)
})
