const assert = require('node:assert/strict')
const fs     = require('node:fs')
const os     = require('node:os')
const path   = require('node:path')
const test   = require('node:test')

const { compose }                         = require('@itrocks/compose')
const { config, scanConfigFiles }         = require('@itrocks/config')
const { FastifyServer }                   = require('@itrocks/fastify')
const { Template }                        = require('@itrocks/template')
const { SkinFastifyServer, SkinTemplate } = require('../cjs/skin')

test('exports integration subclasses', () => {
	assert.equal(Object.getPrototypeOf(SkinFastifyServer), FastifyServer)
	assert.equal(Object.getPrototypeOf(SkinTemplate), Template)
})

test('loads and composes each integration class through the framework bootstrap configuration', async context => {
	const application     = fs.mkdtempSync(path.join(os.tmpdir(), 'itrocks-skin-bootstrap-'))
	const modules         = path.join(application, 'node_modules', '@itrocks')
	const previousCompose = config.compose
	const previousSkin    = config.skin
	fs.mkdirSync(modules, { recursive: true })
	fs.symlinkSync(path.resolve(__dirname, '..'), path.join(modules, 'skin'), 'dir')
	context.after(() => {
		config.compose = previousCompose
		config.skin    = previousSkin
		fs.rmSync(application, { force: true, recursive: true })
	})
	await scanConfigFiles(application)

	assert.equal(config.compose['@itrocks/fastify:FastifyServer'], '@itrocks/skin/fastify:SkinFastifyServer')
	assert.equal(config.compose['@itrocks/template:Template'], '@itrocks/skin/template:SkinTemplate')
	compose(application, config.compose)

	assert.equal(require('@itrocks/fastify').FastifyServer, SkinFastifyServer)
	assert.equal(require('@itrocks/template').Template, SkinTemplate)
})
