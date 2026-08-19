import { Template }            from '@itrocks/template'
import { runtimeSkinResolver } from './runtime-resolver'
import { SkinResolver }        from './skin-resolver'

/** Resolves final HTML templates before delegating their parsing to the template engine. */
export class SkinTemplate extends Template
{

	private resolveTemplate(file: string, resolver: SkinResolver): string
	{
		if (resolver.isTarget(file)) return file
		const resolution = resolver.resolve(file, 'template')
		return resolution.replacement ?? resolution.original
	}

	override async parseFile(fileName: string, containerFileName?: string | false): Promise<string>
	{
		const resolver  = runtimeSkinResolver()
		const template  = this.resolveTemplate(fileName, resolver)
		const container = (typeof containerFileName === 'string')
			? this.resolveTemplate(containerFileName, resolver)
			: containerFileName
		return super.parseFile(template, container)
	}

}
