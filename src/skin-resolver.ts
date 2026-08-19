import { Dirent }       from 'node:fs'
import { existsSync }   from 'node:fs'
import { readdirSync }  from 'node:fs'
import { realpathSync } from 'node:fs'
import { statSync }     from 'node:fs'
import { extname }      from 'node:path'
import { isAbsolute }   from 'node:path'
import { join }         from 'node:path'
import { normalize }    from 'node:path'
import { relative }     from 'node:path'
import { resolve }      from 'node:path'
import { sep }          from 'node:path'
import { SkinConfig }   from './config'

export type SkinResourceKind = 'image' | 'style' | 'template'

export type SkinResolution = {
	found:        boolean
	logical:      string
	original:     string
	replacement?: string
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
	packageName: string
	resource?:   string
	source:      string
	target:      string
}

type SourceResource = {
	kind:        SkinResourceKind
	logical:     string
	packageName: string
	packageRoot: string
	relative:    string
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

	constructor(private readonly config: SkinConfig, appDir: string)
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
			|| !target.startsWith('/')
			|| ((target !== '/') && !safeRulePath(target.slice(1)))
		) {
			throw new SkinResolutionError(
				'INVALID_TARGET',
				`Skin rule ${source} must target a merged application path without traversal: ${String(target)}`,
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
		const packageLength = source.startsWith('@') ? 2 : 1
		if ((segments.length < packageLength) || (source.startsWith('@') && !segments[0].slice(1))) {
			throw new SkinResolutionError('INVALID_RULE', `Invalid package name in skin rule: ${source}`, source)
		}
		const packageName = segments.slice(0, packageLength).join('/')
		const resource    = segments.slice(packageLength).join('/') || undefined
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

	private aliasCandidates(rule: SkinRule): string[]
	{
		if (!rule.resource) return []
		const kind = kindOf(rule.resource)
		if (!kind || (kind === 'image')) return []
		const packageRoot = this.packageRoot(rule.packageName)
		return ALIAS_DIRECTORIES[kind]
			.map(directory => directory + '/' + rule.resource)
			.filter(resource => existsSync(join(packageRoot, ...pathSegments(resource))))
	}

	private replacement(source: SourceResource): { path: string, rule: string } | undefined
	{
		const alias       = this.aliasOf(source.relative, source.kind)
		const exactRule   = source.logical
		const aliasRule   = alias && (source.packageName + '/' + alias)
		const packageRule = source.packageName
		if (hasOwn(this.config, exactRule)) {
			const rule = this.parseRule(exactRule, this.config[exactRule])
			return { path: this.targetPath(rule.target), rule: exactRule }
		}
		if (aliasRule && hasOwn(this.config, aliasRule)) {
			if (existsSync(join(source.packageRoot, ...pathSegments(alias!)))) {
				if (!hasOwn(this.config, packageRule)) return
				const packageSkin = this.parseRule(packageRule, this.config[packageRule])
				return {
					path: join(this.targetPath(packageSkin.target), ...pathSegments(source.relative)),
					rule: packageRule
				}
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
			return { path: this.targetPath(rule.target), rule: aliasRule }
		}
		if (hasOwn(this.config, packageRule)) {
			const rule       = this.parseRule(packageRule, this.config[packageRule])
			const targetRoot = this.targetPath(rule.target)
			return {
				path: join(targetRoot, ...pathSegments(source.relative)),
				rule: packageRule
			}
		}
	}

	resolve(file: string, kind: SkinResourceKind): SkinResolution
	{
		const original = isAbsolute(file) ? normalize(file) : file
		const source   = this.sourceResource(file, kind)
		if (!source) return { found: false, logical: original, original }
		const replacement = this.replacement(source)
		if (!replacement) return { found: false, logical: source.logical, original }
		const packageTarget = replacement.rule === source.packageName
		const targetRoot    = packageTarget ? this.targetPath(this.config[replacement.rule]) : this.appRoot
		const realTarget    = packageTarget
			? this.assertRealPath(targetRoot, realpathSync(this.appRoot), replacement.rule, true)
			: realpathSync(this.appRoot)
		if (packageTarget && !statSync(realTarget).isDirectory()) {
			throw new SkinResolutionError(
				'TARGET_NOT_DIRECTORY',
				`Package skin rule ${replacement.rule} must target a directory: ${targetRoot}`,
				replacement.rule
			)
		}
		this.assertTargetFile(replacement.path, realTarget, replacement.rule)
		return {
			found: true,
			logical: source.logical,
			original,
			replacement: replacement.path
		}
	}

	private scanPackage(rule: SkinRule): string[]
	{
		const packageRoot = this.packageRoot(rule.packageName)
		const realRoot    = this.realPackageRoot(rule.packageName, rule.source)
		const resources   = new Array<string>
		const visited     = new Set<string>
		const scan = (directory: string, relativeDirectory = '') => {
			const realDirectory = this.assertRealPath(directory, realRoot, rule.source, false)
			if (visited.has(realDirectory)) return
			visited.add(realDirectory)
			let entries: Dirent[]
			try {
				entries = readdirSync(directory, { withFileTypes: true })
			}
			catch {
				throw new SkinResolutionError(
					'UNREADABLE_SOURCE',
					`Cannot read source package for skin rule ${rule.source}: ${directory}`,
					rule.source
				)
			}
			for (const entry of entries) {
				const childRelative = relativeDirectory ? (relativeDirectory + '/' + entry.name) : entry.name
				if (pathSegments(childRelative).includes('src') || pathSegments(childRelative).includes('node_modules')) {
					continue
				}
				const child = join(directory, entry.name)
				if (entry.isSymbolicLink()) {
					const realChild = this.assertRealPath(child, realRoot, rule.source, false)
					const status    = statSync(realChild)
					if (status.isDirectory()) scan(child, childRelative)
					else if (status.isFile() && kindOf(childRelative)) resources.push(childRelative)
					continue
				}
				if (entry.isDirectory()) scan(child, childRelative)
				else if (entry.isFile() && kindOf(childRelative)) resources.push(childRelative)
			}
		}
		scan(packageRoot)
		return resources.sort()
	}

	private validateExactRule(rule: SkinRule)
	{
		const packageRoot = this.packageRoot(rule.packageName)
		const realRoot    = this.realPackageRoot(rule.packageName, rule.source)
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

	private overridden(packageName: string, resource: string): boolean
	{
		const full = packageName + '/' + resource
		if (hasOwn(this.config, full)) return true
		const kind  = kindOf(resource)
		const alias = kind && this.aliasOf(resource, kind)
		return !!alias
			&& !existsSync(join(this.packageRoot(packageName), ...pathSegments(alias)))
			&& hasOwn(this.config, packageName + '/' + alias)
	}

	private validatePackageRule(rule: SkinRule)
	{
		const targetRoot = this.targetPath(rule.target)
		const realTarget = this.assertRealPath(targetRoot, realpathSync(this.appRoot), rule.source, true)
		if (!statSync(realTarget).isDirectory()) {
			throw new SkinResolutionError(
				'TARGET_NOT_DIRECTORY',
				`Package skin rule ${rule.source} must target a directory: ${targetRoot}`,
				rule.source
			)
		}
		for (const resource of this.scanPackage(rule)) {
			if (this.overridden(rule.packageName, resource)) continue
			this.assertTargetFile(join(targetRoot, ...pathSegments(resource)), realTarget, rule.source)
		}
	}

	async validate(): Promise<SkinValidationResult>
	{
		const issues = new Array<SkinValidationIssue>
		for (const [source, target] of Object.entries(this.config)) {
			try {
				const rule = this.parseRule(source, target)
				if (rule.resource) this.validateExactRule(rule)
				else this.validatePackageRule(rule)
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
