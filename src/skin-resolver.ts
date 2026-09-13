import { existsSync }         from 'node:fs'
import { realpathSync }       from 'node:fs'
import { statSync }           from 'node:fs'
import { extname }            from 'node:path'
import { isAbsolute }         from 'node:path'
import { join }               from 'node:path'
import { normalize }          from 'node:path'
import { relative }           from 'node:path'
import { resolve }            from 'node:path'
import { sep }                from 'node:path'
import { SkinConfig }         from './config'
import { debug }              from './debug'
import { logSkinResolution }  from './debug'

export type SkinResourceKind = 'image' | 'style' | 'template'

export type SkinResolution = {
	found:        boolean
	logical:      string
	original:     string
	replacement?: string
}

export type SkinReplacementRule = {
	source: string
	target: string
}

export type SkinDiagnosticEvent = SkinResolution & {
	candidates: string[]
	final:       string
	kind:        SkinResourceKind
	rule?:       SkinReplacementRule
}

export type SkinResolverOptions = {
	diagnostic?: (event: SkinDiagnosticEvent) => void
}

export type SkinValidationCode =
	| 'AMBIGUOUS_ALIAS'
	| 'INVALID_RULE'
	| 'INVALID_TARGET'
	| 'PACKAGE_NOT_FOUND'
	| 'SOURCE_NOT_FOUND'
	| 'SOURCE_OUTSIDE_ROOT'
	| 'TARGET_NOT_DIRECTORY'
	| 'TARGET_NOT_FILE'
	| 'TARGET_NOT_FOUND'
	| 'TARGET_OUTSIDE_ROOT'
	| 'UNREADABLE_SOURCE'
	| 'UNSUPPORTED_RESOURCE'

export type SkinValidationIssue = {
	code:    SkinValidationCode
	message: string
	rule:    string
}

export type SkinValidationResult = {
	issues: SkinValidationIssue[]
	valid:  boolean
}

type SkinRule = {
	namespace?:  string
	packageName?: string
	resource?:   string
	source:      string
	target:      string
}

type SourceResource = {
	kind:        SkinResourceKind
	logical:     string
	namespace?:  string
	packageName: string
	packageRoot: string
	relative:    string
}

type TargetRoot = {
	path: string
	real: string
}

type ReplacementSearch = {
	candidates: string[]
	exact:      boolean
	rule:       SkinReplacementRule
	targetRoot: TargetRoot
}

const ALIAS_DIRECTORIES: Record<'style' | 'template', string[]> = {
	style:    ['cjs', 'css'],
	template: ['cjs', 'html']
}

const hasOwn = (object: object, property: string) => Object.prototype.hasOwnProperty.call(object, property)

function contains(root: string, path: string): boolean
{
	const fromRoot = relative(root, path)
	return (fromRoot === '') || (!fromRoot.startsWith('..' + sep) && (fromRoot !== '..') && !isAbsolute(fromRoot))
}

function issue(code: SkinValidationCode, rule: string, message: string): SkinValidationIssue
{
	return { code, message, rule }
}

function kindOf(path: string): SkinResourceKind | undefined
{
	switch (extname(path).toLowerCase()) {
		case '.css':
			return 'style'
		case '.html':
			return 'template'
		case '.jpg':
		case '.png':
			return 'image'
	}
	return undefined
}

function pathSegments(path: string): string[]
{
	return path.split('/')
}

function safeRulePath(path: string): boolean
{
	return !!path
		&& !path.includes('\\')
		&& !path.includes('\0')
		&& pathSegments(path).every(segment => !!segment && (segment !== '.') && (segment !== '..'))
}

function safeTargetReference(path: string): boolean
{
	const segments = pathSegments(path)
	return path.startsWith('@')
		&& (segments.length <= 2)
		&& !!segments[0].slice(1)
		&& ((segments.length === 1) || !!segments[1])
		&& safeRulePath(path)
}

export class SkinResolutionError extends Error
{

	constructor(
		public code: SkinValidationCode,
		message: string,
		public rule: string
	) {
		super(message)
		this.name = 'SkinResolutionError'
	}

}

export class SkinResolver
{

	private readonly appRoot:     string
	private readonly modulesRoot: string

	constructor(
		private readonly config: SkinConfig,
		appDir: string,
		private readonly options: SkinResolverOptions = {}
	)
	{
		this.appRoot     = resolve(appDir)
		this.modulesRoot = join(this.appRoot, 'node_modules')
	}

	private aliasOf(resource: string, kind: SkinResourceKind): string | undefined
	{
		if (kind === 'image') return
		const slash = resource.indexOf('/')
		if ((slash < 0) || !ALIAS_DIRECTORIES[kind].includes(resource.slice(0, slash))) return
		return resource.slice(slash + 1)
	}

	private assertRealPath(path: string, root: string, rule: string, target: boolean): string
	{
		let realPath: string
		try {
			realPath = realpathSync(path)
		}
		catch {
			throw new SkinResolutionError(
				target ? 'TARGET_NOT_FOUND' : 'SOURCE_NOT_FOUND',
				`${target ? 'Target' : 'Source'} does not exist for skin rule ${rule}: ${path}`,
				rule
			)
		}
		if (!contains(root, realPath)) {
			throw new SkinResolutionError(
				target ? 'TARGET_OUTSIDE_ROOT' : 'SOURCE_OUTSIDE_ROOT',
				`${target ? 'Target' : 'Source'} escapes its allowed root for skin rule ${rule}: ${path}`,
				rule
			)
		}
		return realPath
	}

	private assertTargetFile(path: string, root: string, rule: string): string
	{
		const realPath = this.assertRealPath(path, root, rule, true)
		if (!statSync(realPath).isFile()) {
			throw new SkinResolutionError(
				'TARGET_NOT_FILE',
				`Target is not a file for skin rule ${rule}: ${path}`,
				rule
			)
		}
		return path
	}

	private packageRoot(packageName: string): string
	{
		return join(this.modulesRoot, ...pathSegments(packageName))
	}

	private realPackageRoot(packageName: string, rule: string): string
	{
		const packageRoot = this.packageRoot(packageName)
		let realRoot: string
		try {
			realRoot = realpathSync(packageRoot)
		}
		catch {
			throw new SkinResolutionError(
				'PACKAGE_NOT_FOUND',
				`Installed package does not exist for skin rule ${rule}: ${packageName}`,
				rule
			)
		}
		if (!statSync(realRoot).isDirectory() || !existsSync(join(realRoot, 'package.json'))) {
			throw new SkinResolutionError(
				'PACKAGE_NOT_FOUND',
				`Skin rule ${rule} does not identify an installed package: ${packageName}`,
				rule
			)
		}
		return realRoot
	}

	private parseRule(source: string, target: unknown): SkinRule
	{
		if (
			(typeof target !== 'string')
			|| (
				!target.startsWith('/')
				&& !safeTargetReference(target)
			)
			|| (target.startsWith('/') && (target !== '/') && !safeRulePath(target.slice(1)))
		) {
			throw new SkinResolutionError(
				'INVALID_TARGET',
				`Skin rule ${source} must target an application path, installed package or package namespace without `
				+ `traversal: ${String(target)}`,
				source
			)
		}
		if (!safeRulePath(source)) {
			throw new SkinResolutionError(
				'INVALID_RULE',
				`Invalid skin rule source path: ${source}`,
				source
			)
		}
		const segments = pathSegments(source)
		if (source.startsWith('@') && (segments.length === 1) && !!segments[0].slice(1)) {
			return { namespace: source, source, target }
		}
		const packageLength = source.startsWith('@') ? 2 : 1
		if ((segments.length < packageLength) || (source.startsWith('@') && !segments[0].slice(1))) {
			throw new SkinResolutionError('INVALID_RULE', `Invalid package name in skin rule: ${source}`, source)
		}
		const packageName = segments.slice(0, packageLength).join('/')
		const resource    = segments.slice(packageLength).join('/') || undefined
		if (resource && !target.startsWith('/')) {
			throw new SkinResolutionError(
				'INVALID_TARGET',
				`File skin rule ${source} must target a merged application file path: ${target}`,
				source
			)
		}
		if (resource && !kindOf(resource)) {
			throw new SkinResolutionError(
				'UNSUPPORTED_RESOURCE',
				`Skin rule ${source} does not identify an HTML, CSS, JPG or PNG artifact`,
				source
			)
		}
		return { packageName, resource, source, target }
	}

	private sourceResource(file: string, requestedKind: SkinResourceKind): SourceResource | undefined
	{
		if (!isAbsolute(file)) return
		const original     = normalize(file)
		const fromModules  = relative(this.modulesRoot, original)
		if (!fromModules || fromModules.startsWith('..' + sep) || (fromModules === '..') || isAbsolute(fromModules)) return
		const segments      = fromModules.split(sep)
		const packageLength = segments[0]?.startsWith('@') ? 2 : 1
		if (segments.length <= packageLength) return
		if (segments.slice(packageLength).includes('node_modules')) return
		const packageName = segments.slice(0, packageLength).join('/')
		const relativePath = segments.slice(packageLength).join('/')
		const kind         = kindOf(relativePath)
		if ((kind !== requestedKind) || pathSegments(relativePath).includes('src')) return
		const packageRoot = this.packageRoot(packageName)
		const realRoot    = this.realPackageRoot(packageName, packageName)
		const realSource  = this.assertRealPath(original, realRoot, packageName + '/' + relativePath, false)
		if (!statSync(realSource).isFile()) return
		return {
			kind,
			logical: packageName + '/' + relativePath,
			namespace: packageName.startsWith('@') ? packageName.split('/')[0] : undefined,
			packageName,
			packageRoot,
			relative: relativePath
		}
	}

	private targetPath(target: string): string
	{
		const path = resolve(this.appRoot, '.' + target)
		if (!contains(this.appRoot, path)) {
			throw new SkinResolutionError(
				'TARGET_OUTSIDE_ROOT',
				`Skin target escapes the application root: ${target}`,
				target
			)
		}
		return path
	}

	private targetRoot(rule: SkinRule): TargetRoot
	{
		const appRoot = realpathSync(this.appRoot)
		if (rule.target.startsWith('/')) {
			const path = this.targetPath(rule.target)
			const real = this.assertRealPath(path, appRoot, rule.source, true)
			if (statSync(real).isDirectory()) return { path, real }
			throw new SkinResolutionError(
				'TARGET_NOT_DIRECTORY',
				`Skin rule ${rule.source} must target a directory: ${path}`,
				rule.source
			)
		}
		const path = join(this.modulesRoot, ...pathSegments(rule.target))
		let real: string
		try {
			real = realpathSync(path)
		}
		catch {
			throw new SkinResolutionError(
				'TARGET_NOT_FOUND',
				`Installed target does not exist for skin rule ${rule.source}: ${rule.target}`,
				rule.source
			)
		}
		if (!statSync(real).isDirectory()) {
			throw new SkinResolutionError(
				'TARGET_NOT_DIRECTORY',
				`Skin rule ${rule.source} must target a directory: ${path}`,
				rule.source
			)
		}
		if ((pathSegments(rule.target).length === 2) && !existsSync(join(real, 'package.json'))) {
			throw new SkinResolutionError(
				'INVALID_TARGET',
				`Installed target is not a package for skin rule ${rule.source}: ${rule.target}`,
				rule.source
			)
		}
		return { path, real }
	}

	private aliasCandidates(rule: SkinRule): string[]
	{
		if (!rule.resource || !rule.packageName) return []
		const kind = kindOf(rule.resource)
		if (!kind || (kind === 'image')) return []
		const packageRoot = this.packageRoot(rule.packageName)
		return ALIAS_DIRECTORIES[kind]
			.map(directory => directory + '/' + rule.resource)
			.filter(resource => existsSync(join(packageRoot, ...pathSegments(resource))))
	}

	private folderSearch(rule: SkinRule, relativePaths: string[]): ReplacementSearch
	{
		const targetRoot = this.targetRoot(rule)
		return {
			candidates: relativePaths.map(relativePath =>
				join(targetRoot.path, ...pathSegments(relativePath))
			),
			exact: false,
			rule: { source: rule.source, target: rule.target },
			targetRoot
		}
	}

	private replacement(source: SourceResource): ReplacementSearch | undefined
	{
		const alias       = this.aliasOf(source.relative, source.kind)
		const exactRule   = source.logical
		const aliasRule   = alias && (source.packageName + '/' + alias)
		const packageRule = source.packageName
		if (hasOwn(this.config, exactRule)) {
			const rule = this.parseRule(exactRule, this.config[exactRule])
			return {
				candidates: [this.targetPath(rule.target)],
				exact: true,
				rule: { source: rule.source, target: rule.target },
				targetRoot: { path: this.appRoot, real: realpathSync(this.appRoot) }
			}
		}
		if (aliasRule && hasOwn(this.config, aliasRule)) {
			if (existsSync(join(source.packageRoot, ...pathSegments(alias!)))) {
				if (!hasOwn(this.config, packageRule)) return
				const packageSkin = this.parseRule(packageRule, this.config[packageRule])
				return this.folderSearch(packageSkin, [source.relative])
			}
			const rule       = this.parseRule(aliasRule, this.config[aliasRule])
			const candidates = this.aliasCandidates(rule)
			if (candidates.length > 1) {
				throw new SkinResolutionError(
					'AMBIGUOUS_ALIAS',
					`Skin rule ${aliasRule} matches multiple published artifacts: ${candidates.join(', ')}`,
					aliasRule
				)
			}
			return {
				candidates: [this.targetPath(rule.target)],
				exact: true,
				rule: { source: rule.source, target: rule.target },
				targetRoot: { path: this.appRoot, real: realpathSync(this.appRoot) }
			}
		}
		if (hasOwn(this.config, packageRule)) {
			const rule = this.parseRule(packageRule, this.config[packageRule])
			return this.folderSearch(rule, [source.relative])
		}
		if (source.namespace && hasOwn(this.config, source.namespace)) {
			const rule        = this.parseRule(source.namespace, this.config[source.namespace])
			const packageName = source.packageName.slice(source.namespace.length + 1)
			return this.folderSearch(rule, [
				source.namespace + '/' + packageName + '/' + source.relative,
				packageName + '/' + source.relative
			])
		}
	}

	resolve(file: string, kind: SkinResourceKind): SkinResolution
	{
		const original = isAbsolute(file) ? normalize(file) : file
		const source   = this.sourceResource(file, kind)
		if (!source) return this.report({ found: false, logical: original, original }, kind)
		const search = this.replacement(source)
		if (!search) return this.report({ found: false, logical: source.logical, original }, kind)
		const replacement = search.candidates.find(candidate => existsSync(candidate))
		if (!replacement) {
			if (search.exact) this.assertTargetFile(search.candidates[0], search.targetRoot.real, search.rule.source)
			return this.report({ found: false, logical: source.logical, original }, kind, search)
		}
		this.assertTargetFile(replacement, search.targetRoot.real, search.rule.source)
		return this.report({
			found: true,
			logical: source.logical,
			original,
			replacement
		}, kind, search)
	}

	private report(
		resolution: SkinResolution, kind: SkinResourceKind, search?: ReplacementSearch
	): SkinResolution
	{
		const event: SkinDiagnosticEvent = {
			...resolution,
			candidates: search?.candidates ?? [],
			final: resolution.replacement ?? resolution.original,
			kind,
			rule: search?.rule
		}
		this.options.diagnostic?.(event)
		if (debug && (this.options.diagnostic !== logSkinResolution)) logSkinResolution(event)
		return resolution
	}

	isTarget(file: string): boolean
	{
		if (!isAbsolute(file)) return false
		const candidate = normalize(file)
		for (const [source, target] of Object.entries(this.config)) {
			try {
				const rule = this.parseRule(source, target)
				if (rule.resource) {
					if (candidate === this.targetPath(rule.target)) return true
					continue
				}
				if (contains(this.targetRoot(rule).path, candidate)) return true
			}
			catch (error) {
				if (error instanceof SkinResolutionError) continue
				throw error
			}
		}
		return false
	}

	private validateExactRule(rule: SkinRule)
	{
		const packageRoot = this.packageRoot(rule.packageName!)
		const realRoot    = this.realPackageRoot(rule.packageName!, rule.source)
		const exact = join(packageRoot, ...pathSegments(rule.resource!))
		let source = existsSync(exact) ? exact : undefined
		if (!source) {
			const candidates = this.aliasCandidates(rule)
			if (candidates.length > 1) {
				throw new SkinResolutionError(
					'AMBIGUOUS_ALIAS',
					`Skin rule ${rule.source} matches multiple published artifacts: ${candidates.join(', ')}`,
					rule.source
				)
			}
			source = candidates[0] && join(packageRoot, ...pathSegments(candidates[0]))
		}
		if (!source) {
			throw new SkinResolutionError(
				'SOURCE_NOT_FOUND',
				`No published artifact matches skin rule ${rule.source}`,
				rule.source
			)
		}
		const realSource = this.assertRealPath(source, realRoot, rule.source, false)
		if (!statSync(realSource).isFile()) {
			throw new SkinResolutionError(
				'SOURCE_NOT_FOUND',
				`Published artifact is not a file for skin rule ${rule.source}`,
				rule.source
			)
		}
		this.assertTargetFile(this.targetPath(rule.target), realpathSync(this.appRoot), rule.source)
	}

	private validatePackageRule(rule: SkinRule)
	{
		this.realPackageRoot(rule.packageName!, rule.source)
		this.targetRoot(rule)
	}

	private validateNamespaceRule(rule: SkinRule)
	{
		const sourceRoot = join(this.modulesRoot, rule.namespace!)
		let realSource: string
		try {
			realSource = realpathSync(sourceRoot)
		}
		catch {
			throw new SkinResolutionError(
				'SOURCE_NOT_FOUND',
				`Package namespace does not exist for skin rule ${rule.source}: ${rule.namespace}`,
				rule.source
			)
		}
		if (!statSync(realSource).isDirectory()) {
			throw new SkinResolutionError(
				'SOURCE_NOT_FOUND',
				`Skin rule ${rule.source} does not identify a package namespace directory`,
				rule.source
			)
		}
		this.targetRoot(rule)
	}

	async validate(): Promise<SkinValidationResult>
	{
		const issues = new Array<SkinValidationIssue>
		for (const [source, target] of Object.entries(this.config)) {
			try {
				const rule = this.parseRule(source, target)
				if (rule.resource) this.validateExactRule(rule)
				else if (rule.packageName) this.validatePackageRule(rule)
				else this.validateNamespaceRule(rule)
			}
			catch (error) {
				if (error instanceof SkinResolutionError) {
					issues.push(issue(error.code, error.rule, error.message))
					continue
				}
				throw error
			}
		}
		issues.sort((left, right) =>
			left.rule.localeCompare(right.rule)
			|| left.code.localeCompare(right.code)
			|| left.message.localeCompare(right.message)
		)
		return { issues, valid: !issues.length }
	}

}
