import type { SkinDiagnosticEvent } from './skin-resolver'

/** Enables detailed console diagnostics for runtime resource replacement searches. */
export let debug = false

export function logSkinResolution(event: SkinDiagnosticEvent)
{
	if (!event.rule) return
	const candidates = event.candidates.length
		? event.candidates.map(candidate => `    - ${candidate}`).join('\n')
		: '    - none'
	const final = event.replacement
		? event.replacement
		: `${event.original} (original; no replacement found)`
	console.debug(
		`[skin] ${event.kind} resource replacement\n`
		+ `  original: ${event.original}\n`
		+ `  rule: ${event.rule.source} -> ${event.rule.target}\n`
		+ `  candidates:\n${candidates}\n`
		+ `  final: ${final}`
	)
}

/** Changes runtime resource replacement diagnostics without relying on application configuration. */
export function setDebug(enabled: boolean): void
{
	debug = enabled
}
