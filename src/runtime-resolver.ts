import { appDir }              from '@itrocks/app-dir'
import { config }              from '@itrocks/config'
import { SkinConfig }          from './config'
import { logSkinResolution }   from './debug'
import { SkinResolver }        from './skin-resolver'

/** Builds the resolver used by composed integrations, with explicitly enabled diagnostics. */
export function runtimeSkinResolver(): SkinResolver
{
	return new SkinResolver((config.skin ?? {}) as SkinConfig, appDir, {
		diagnostic: (config.skinDiagnostics === true) ? logSkinResolution : undefined
	})
}
