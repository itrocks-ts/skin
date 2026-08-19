import { appDir }              from '@itrocks/app-dir'
import { config }              from '@itrocks/config'
import { SkinConfig }          from './config'
import { SkinDiagnosticEvent } from './skin-resolver'
import { SkinResolver }        from './skin-resolver'

function logResolution(event: SkinDiagnosticEvent)
{
	const result = event.replacement ? `replaced by ${event.replacement}` : 'unchanged'
	console.debug(`[skin] ${event.kind} ${event.logical}: ${result}`)
}

/** Builds the resolver used by composed integrations, with explicitly enabled diagnostics. */
export function runtimeSkinResolver(): SkinResolver
{
	return new SkinResolver((config.skin ?? {}) as SkinConfig, appDir, {
		diagnostic: (config.skinDiagnostics === true) ? logResolution : undefined
	})
}
