const assert = require('node:assert/strict')
const fs     = require('node:fs')
const os     = require('node:os')
const path   = require('node:path')
const test   = require('node:test')

const appDirModule                       = require('@itrocks/app-dir')
const { compose }                         = require('@itrocks/compose')
const { config, scanConfigFiles }         = require('@itrocks/config')
const { FastifyServer }                   = require('@itrocks/fastify')
const { Template }                        = require('@itrocks/template')
const { SkinFastifyServer, SkinResolver, SkinTemplate } = require('../cjs/skin')

function createFile(file, content)
{
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
	return file
}

test('exports integration subclasses', () => {
	assert.equal(Object.getPrototypeOf(SkinFastifyServer), FastifyServer)
	assert.equal(Object.getPrototypeOf(SkinTemplate), Template)
})

test('loads and composes each integration class through the framework bootstrap configuration', async context => {
	const application     = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-bootstrap-'))
	const modules         = path.join(application, 'node_modules', '@itrocks')
	const contentRoot     = path.join(application, 'node_modules', '@demo', 'content')
	const skinRoot        = path.join(application, 'node_modules', '@demo', 'blue-skin')
	const previousAppDir  = appDirModule.appDir
	const previousCompose = config.compose
	const previousSkin    = config.skin
	const previousDebug   = config.skinDiagnostics
	fs.mkdirSync(modules, { recursive: true })
	fs.symlinkSync(path.resolve(__dirname, '..'), path.join(modules, 'skin'), 'dir')
	createFile(path.join(application, 'package.json'), JSON.stringify({
		dependencies: {
			'@demo/blue-skin': 'latest',
			'@demo/content':   'latest',
			'@itrocks/skin':   'latest'
		}
	}))
	createFile(path.join(contentRoot, 'package.json'), '{"name":"@demo/content"}')
	createFile(path.join(contentRoot, 'cjs/page.html'), '<p>ORIGINAL</p>')
	createFile(path.join(contentRoot, 'css/theme.css'), 'ORIGINAL PACKAGE CSS')
	createFile(path.join(contentRoot, 'images/photo.jpg'), 'ORIGINAL JPG')
	createFile(path.join(contentRoot, 'images/logo.png'), 'ORIGINAL PNG')
	createFile(path.join(skinRoot, 'package.json'), JSON.stringify({
		name: '@demo/blue-skin', dependencies: { '@itrocks/skin': 'latest' }
	}))
	createFile(path.join(skinRoot, 'config.yaml'), "skin:\n  '@demo/content': ./content\n")
	createFile(path.join(skinRoot, 'content/cjs/page.html'), '<p>PACKAGE SKIN</p>')
	createFile(path.join(skinRoot, 'content/css/theme.css'), 'PACKAGE SKIN CSS')
	createFile(path.join(skinRoot, 'content/images/photo.jpg'), 'PACKAGE SKIN JPG')
	createFile(path.join(skinRoot, 'content/images/logo.png'), 'PACKAGE SKIN PNG')
	createFile(path.join(application, 'app/theme.css'), 'APPLICATION CSS')
	createFile(path.join(application, 'config.yaml'), "skin:\n  '@demo/content/theme.css': /app/theme.css\n")
	appDirModule.appDir = application
	context.after(() => {
		appDirModule.appDir    = previousAppDir
		config.compose         = previousCompose
		config.skin            = previousSkin
		config.skinDiagnostics = previousDebug
		fs.rmSync(application, { force: true, recursive: true })
	})
	await scanConfigFiles(application)

	assert.equal(config.compose['@itrocks/fastify:FastifyServer'], '@itrocks/skin/fastify:SkinFastifyServer')
	assert.equal(config.compose['@itrocks/template:Template'], '@itrocks/skin/template:SkinTemplate')
	assert.deepEqual(config.skin, {
		'@demo/content':           '/node_modules/@demo/blue-skin/content',
		'@demo/content/theme.css': '/app/theme.css'
	})
	const resolver = new SkinResolver(config.skin, application)
	assert.deepEqual(await resolver.validate(), { issues: [], valid: true })
	assert.equal(
		resolver.resolve(path.join(contentRoot, 'cjs/page.html'), 'template').replacement,
		path.join(skinRoot, 'content/cjs/page.html')
	)
	assert.equal(
		resolver.resolve(path.join(contentRoot, 'css/theme.css'), 'style').replacement,
		path.join(application, 'app/theme.css')
	)
	assert.equal(
		await new SkinTemplate().parseFile(path.join(contentRoot, 'cjs/page.html')),
		'<p>PACKAGE SKIN</p>'
	)
	compose(application, config.compose)

	assert.equal(require('@itrocks/fastify').FastifyServer, SkinFastifyServer)
	assert.equal(require('@itrocks/template').Template, SkinTemplate)
})
