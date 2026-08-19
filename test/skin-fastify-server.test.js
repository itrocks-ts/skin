const assert = require('node:assert/strict')
const fs     = require('node:fs')
const os     = require('node:os')
const path   = require('node:path')
const test   = require('node:test')

const appDirModule           = require('@itrocks/app-dir')
const { config }             = require('@itrocks/config')
const { FastifyServer }      = require('@itrocks/fastify')
const { SkinFastifyServer } = require('../cjs/skin-fastify-server')
const { SkinResolver }       = require('../cjs/skin-resolver')

function createFile(file, content)
{
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
	return file
}

function fixture(context, packageName = '@itrocks/content')
{
	const application    = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-fastify-'))
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
		skin: (relative, content) => createFile(path.join(application, ...relative.split('/')), content),
		url: relative => `/@itrocks/${packageName.split('/')[1]}/${relative}`
	}
}

async function prepareServer(context, application, Server = SkinFastifyServer, frontScripts = [])
{
	const sessions = new Map()
	const server    = new Server({
		assetPath:   application,
		execute:     async () => { throw new Error('Static asset request unexpectedly reached execute()') },
		favicon:     '',
		frontScripts,
		host:        '127.0.0.1',
		port:        0,
		scriptCalls: [],
		secret:      'a-secure-test-secret-with-32-characters',
		secure:      false,
		store:       {
			destroy: (id, callback) => { sessions.delete(id); callback() },
			get:     (id, callback) => callback(null, sessions.get(id)),
			set:     (id, session, callback) => { sessions.set(id, session); callback() }
		}
	})
	context.after(() => server.stop())
	server.prepare()
	await server.server.ready()
	return server.server
}

test('serves exact CSS replacements from every published layout with native caching', async context => {
	const app = fixture(context)
	const cases = [
		['root.css',                 'skin/root.css',   'ROOT',   'root.css'],
		['css/theme.css',            'skin/theme.css',  'CSS',    'theme.css'],
		['cjs/admin.css',            'skin/admin.css',  'CJS',    'admin.css'],
		['assets/nested/detail.css', 'skin/detail.css', 'NESTED', 'assets/nested/detail.css']
	]
	config.skin = {}
	for (const [source, target, text, rule] of cases) {
		app.original(source, `ORIGINAL ${text}`)
		app.skin(target, `SKIN ${text}`)
		config.skin[`@itrocks/content/${rule}`] = '/' + target
	}
	const server = await prepareServer(context, app.application)

	for (const [source, , text] of cases) {
		const response = await server.inject({ method: 'GET', url: app.url(source) })

		assert.equal(response.statusCode, 200)
		assert.equal(response.body, `SKIN ${text}`)
		assert.equal(response.headers['content-type'], 'text/css; charset=utf-8')
		assert.equal(response.headers.location, undefined)
	}

	const cached = await server.inject({
		headers: { 'if-modified-since': new Date(Date.now() + 60_000).toUTCString() },
		method:  'GET',
		url:     app.url('root.css')
	})
	assert.equal(cached.statusCode, 304)
})

test('keeps CSS-relative images at their published path under a package rule', async context => {
	const app = fixture(context)
	app.original('css/theme.css', 'ORIGINAL CSS')
	app.original('css/background.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00]))
	app.skin('skin/css/theme.css', 'SKIN CSS')
	const replacementImage = Buffer.from([0xff, 0xd8, 0xff, 0x42])
	app.skin('skin/css/background.jpg', replacementImage)
	config.skin = { '@itrocks/content': '/skin' }

	assert.deepEqual(
		await new SkinResolver(config.skin, app.application).validate(),
		{ issues: [], valid: true }
	)
	const server = await prepareServer(context, app.application)
	const style  = await server.inject({ method: 'GET', url: app.url('css/theme.css') })
	const image  = await server.inject({ method: 'GET', url: app.url('css/background.jpg') })

	assert.equal(style.body, 'SKIN CSS')
	assert.equal(style.headers['content-type'], 'text/css; charset=utf-8')
	assert.deepEqual(image.rawPayload, replacementImage)
	assert.equal(image.headers['content-type'], 'image/jpeg')
})

test('serves exact JPG and PNG replacements from root and nested paths', async context => {
	const app = fixture(context)
	const rootJpg   = Buffer.from([0xff, 0xd8, 0xff, 0x11])
	const nestedJpg = Buffer.from([0xff, 0xd8, 0xff, 0x22])
	const rootPng   = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x33])
	const nestedPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x44])
	app.original('photo.jpg', Buffer.from('ORIGINAL JPG'))
	app.original('images/banner.jpg', Buffer.from('ORIGINAL NESTED JPG'))
	app.original('logo.png', Buffer.from('ORIGINAL PNG'))
	app.original('images/avatar.png', Buffer.from('ORIGINAL PNG'))
	app.skin('skin/photo.jpg', rootJpg)
	app.skin('skin/images/banner.jpg', nestedJpg)
	app.skin('skin/logo.png', rootPng)
	app.skin('skin/images/avatar.png', nestedPng)
	config.skin = {
		'@itrocks/content/images/banner.jpg': '/skin/images/banner.jpg',
		'@itrocks/content/images/avatar.png': '/skin/images/avatar.png',
		'@itrocks/content/logo.png':          '/skin/logo.png',
		'@itrocks/content/photo.jpg':         '/skin/photo.jpg'
	}
	const server = await prepareServer(context, app.application)
	for (const [source, content, mimeType] of [
		['photo.jpg',         rootJpg,   'image/jpeg'],
		['images/banner.jpg', nestedJpg, 'image/jpeg'],
		['logo.png',          rootPng,   'image/png'],
		['images/avatar.png', nestedPng, 'image/png']
	]) {
		const response = await server.inject({ method: 'GET', url: app.url(source) })

		assert.deepEqual(response.rawPayload, content)
		assert.equal(response.headers['content-type'], mimeType)
	}
})

test('does not infer an image rule from an exact CSS replacement', async context => {
	const app = fixture(context)
	app.original('css/theme.css', 'ORIGINAL CSS')
	const originalImage = Buffer.from([0xff, 0xd8, 0xff, 0x51])
	app.original('css/background.jpg', originalImage)
	app.skin('skin/theme.css', 'SKIN CSS')
	app.skin('skin/background.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x52]))
	config.skin = { '@itrocks/content/theme.css': '/skin/theme.css' }
	const server = await prepareServer(context, app.application)

	const style = await server.inject({ method: 'GET', url: app.url('css/theme.css') })
	const image = await server.inject({ method: 'GET', url: app.url('css/background.jpg') })

	assert.equal(style.body, 'SKIN CSS')
	assert.deepEqual(image.rawPayload, originalImage)
})

test('translates replacement files installed in an it.rocks package back to a static path', async context => {
	const app = fixture(context)
	app.original('css/theme.css', 'ORIGINAL CSS')
	app.skin('node_modules/@itrocks/custom/package.json', '{"name":"@itrocks/custom"}')
	app.skin('node_modules/@itrocks/custom/css/theme.css', 'PACKAGE SKIN CSS')
	config.skin = {
		'@itrocks/content/theme.css': '/node_modules/@itrocks/custom/css/theme.css'
	}
	const server   = await prepareServer(context, app.application)
	const response = await server.inject({ method: 'GET', url: app.url('css/theme.css') })

	assert.equal(response.statusCode, 200)
	assert.equal(response.body, 'PACKAGE SKIN CSS')
	assert.equal(response.headers['content-type'], 'text/css; charset=utf-8')
})

test('leaves SCSS, JavaScript, TypeScript, SVG and WOFF2 assets unchanged', async context => {
	const app = fixture(context)
	const cases = [
		['css/theme.scss',  'ORIGINAL SCSS', 'text/css; charset=utf-8'],
		['cjs/app.js',      'ORIGINAL JS',   'text/javascript; charset=utf-8'],
		['cjs/types.ts',    'ORIGINAL TS',   'text/typescript'],
		['images/logo.svg', '<svg>ORIGINAL</svg>', 'image/svg+xml; charset=utf-8'],
		['fonts/app.woff2', Buffer.from([0x77, 0x4f, 0x46, 0x32]), 'font/woff2']
	]
	for (const [source, content] of cases) {
		app.original(source, content)
		app.skin('skin/' + source, typeof content === 'string' ? content.replace('ORIGINAL', 'SKIN') : Buffer.alloc(4))
	}
	config.skin = { '@itrocks/content': '/skin' }
	const frontScripts = [app.url('cjs/app.js'), app.url('cjs/types.ts')]
	const server = await prepareServer(context, app.application, SkinFastifyServer, frontScripts)

	for (const [source, content, mimeType] of cases) {
		const response = await server.inject({ method: 'GET', url: app.url(source) })

		assert.equal(response.statusCode, 200)
		if (typeof content === 'string') assert.equal(response.body, content)
		else assert.deepEqual(response.rawPayload, content)
		assert.equal(response.headers['content-type'], mimeType)
	}
})

test('preserves native Fastify responses for unconfigured and missing assets', async context => {
	const app = fixture(context)
	app.original('css/native.css', 'NATIVE CSS')
	config.skin = {}
	const skinServer   = await prepareServer(context, app.application)
	const nativeServer = await prepareServer(context, app.application, FastifyServer)

	for (const url of [app.url('css/native.css'), app.url('css/missing.css')]) {
		const skinResponse   = await skinServer.inject({ method: 'GET', url })
		const nativeResponse = await nativeServer.inject({ method: 'GET', url })

		assert.equal(skinResponse.statusCode, nativeResponse.statusCode)
		assert.deepEqual(skinResponse.rawPayload, nativeResponse.rawPayload)
		assert.equal(skinResponse.headers['content-type'], nativeResponse.headers['content-type'])
		assert.equal(skinResponse.headers['last-modified'], nativeResponse.headers['last-modified'])
	}
})
