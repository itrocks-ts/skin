const assert = require('node:assert/strict')
const test   = require('node:test')

const { compose }                         = require('@itrocks/compose')
const { FastifyServer }                   = require('@itrocks/fastify')
const { Template }                        = require('@itrocks/template')
const { SkinFastifyServer, SkinTemplate } = require('../cjs/skin')

test('exports integration subclasses', () => {
	assert.equal(Object.getPrototypeOf(SkinFastifyServer), FastifyServer)
	assert.equal(Object.getPrototypeOf(SkinTemplate), Template)
})

test('composes each integration class through its dedicated subpath', () => {
	compose(__dirname, {
		'@itrocks/fastify:FastifyServer': '@itrocks/skin/fastify:SkinFastifyServer',
		'@itrocks/template:Template':     '@itrocks/skin/template:SkinTemplate'
	})

	assert.equal(require('@itrocks/fastify').FastifyServer, SkinFastifyServer)
	assert.equal(require('@itrocks/template').Template, SkinTemplate)
})
