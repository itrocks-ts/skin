import { FastifyServer }       from '@itrocks/fastify'
import { existsSync }          from 'node:fs'
import { extname }             from 'node:path'
import { isAbsolute }          from 'node:path'
import { normalize }           from 'node:path'
import { relative }            from 'node:path'
import { resolve }             from 'node:path'
import { sep }                 from 'node:path'
import { runtimeSkinResolver } from './runtime-resolver'
import { SkinResourceKind }    from './skin-resolver'

type FastifyOriginRequest = Parameters<FastifyServer['httpCall']>[0]
type FastifyFinalResponse = Parameters<FastifyServer['httpCall']>[1]

/** Resolves final CSS and image assets before delegating their service to Fastify. */
export class SkinFastifyServer extends FastifyServer
{

	private assetFile(requestPath: string): string
	{
		const filePath = (requestPath === '/favicon.png') ? this.config.favicon : requestPath
		return normalize(this.config.assetPath + filePath
			.replace(/^\/@itrocks\//, '/node_modules/@itrocks/')
			.replace(/^\/lib\//, '/node_modules/'))
	}

	private publicAssetPath(file: string): string | undefined
	{
		const assetRoot    = resolve(this.config.assetPath)
		const relativeFile = relative(assetRoot, file)
		if (
			!relativeFile
			|| relativeFile.startsWith('..' + sep)
			|| (relativeFile === '..')
			|| isAbsolute(relativeFile)
		) return
		return ('/' + relativeFile.split(sep).join('/'))
			.replace(/^\/node_modules\/@itrocks\//, '/@itrocks/')
			.replace(/^\/node_modules\//, '/lib/')
	}

	private resourceKind(requestPath: string): SkinResourceKind | undefined
	{
		switch (extname(requestPath)) {
			case '.css':
				return 'style'
			case '.jpg':
			case '.png':
				return 'image'
		}
	}

	override async httpCall(
		originRequest: FastifyOriginRequest, finalResponse: FastifyFinalResponse
	)
	{
		const requestedPath = '/' + originRequest.params['*']
		const kind          = this.resourceKind(requestedPath)
		if (!kind || requestedPath.includes('./')) return super.httpCall(originRequest, finalResponse)

		const resolver = runtimeSkinResolver()
		const source   = this.assetFile(requestedPath)
		if (!existsSync(source)) return super.httpCall(originRequest, finalResponse)
		if (resolver.isTarget(source)) return super.httpCall(originRequest, finalResponse)
		const replacement     = resolver.resolve(source, kind).replacement
		const replacementPath = replacement && this.publicAssetPath(replacement)
		if (!replacementPath) return super.httpCall(originRequest, finalResponse)

		const originalPath = originRequest.params['*']
		originRequest.params['*'] = replacementPath.slice(1)
		try {
			return await super.httpCall(originRequest, finalResponse)
		}
		finally {
			originRequest.params['*'] = originalPath
		}
	}

}
