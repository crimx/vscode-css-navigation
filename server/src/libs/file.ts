import * as path from 'path'
import minimatch = require('minimatch')
import {Ignore} from './file-tracker'
import * as fs from 'fs-extra'
const ignoreWalk = require('ignore-walk')



export function generateGlobPatternFromPatterns(patterns: string[]): string | undefined {
	if (patterns.length > 1) {
		return '{' + patterns.join(',') + '}'
	}
	else if (patterns.length === 1) {
		return patterns[0]
	}
	return undefined
}

export function generateGlobPatternFromExtensions(extensions: string[]): string | undefined {
	if (extensions.length > 1) {
		return '**/*.{' + extensions.join(',') + '}'
	}
	else if (extensions.length === 1) {
		return '**/*.' + extensions[0]
	}
	return undefined
}


export function getPathExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase()
}

export function replacePathExtension(filePath: string, toExtension: string): string {
	return filePath.replace(/\.\w+$/, '.' + toExtension)
}


/** Will return the normalized full file path, not include folder paths. */
export async function walkDirectoryToGetFilePaths(
	folderPath: string,
	includeMatcher: minimatch.IMinimatch,
	excludeMatcher: minimatch.IMinimatch | null,
	ignoreFilesBy: Ignore[],
	alwaysIncludeGlobPattern: string | undefined
): Promise<string[]> {
	let filePaths = await ignoreWalk({
		path: folderPath,
		ignoreFiles: ignoreFilesBy,
		includeEmpty: false, // true to include empty dirs, default false
		follow: false, // true to follow symlink dirs, default false
		alwaysIncludeGlobPattern,
	})

	let matchedFilePaths: Set<string> = new Set()

	for (let filePath of filePaths) {
		let absoluteFilePath = path.join(folderPath, filePath)
		if (includeMatcher.match(filePath) && (!excludeMatcher || !excludeMatcher.match(absoluteFilePath))) {
			matchedFilePaths.add(absoluteFilePath)
		}
	}

	return [...matchedFilePaths]
}


/** Resolve import path, will search `node_modules` directory to find final import path. */
export async function resolveImportPath(fromPath: string, toPath: string): Promise<string | null> {
	let isModulePath = toPath.startsWith('~')
	let fromDir = path.dirname(fromPath)
	let fromPathExtension = path.extname(fromPath).slice(1).toLowerCase()

	if (isModulePath) {
		while (fromDir) {
			let filePath = await resolveImportedPath(path.resolve(fromDir, 'node_modules/' + toPath.slice(1)), fromPathExtension)
			if (filePath) {
				return filePath
			}
			let dir = path.dirname(fromDir)
			if (dir === fromDir) {
				break
			}
			fromDir = dir
		}

		return null
	}
	else {
		return await resolveImportedPath(path.resolve(fromDir, toPath), fromPathExtension)
	}
}


/** Fix imported path with extension. */
async function resolveImportedPath(filePath: string, fromPathExtension: string): Promise<string | null> {
	if (await fs.pathExists(filePath)) {
		return filePath
	}

	if (fromPathExtension === 'scss') {
		// @import `b` -> `b.scss`
		if (path.extname(filePath) === '') {
			filePath += '.scss'

			if (await fs.pathExists(filePath)) {
				return filePath
			}
		}

		// @import `b.scss` -> `_b.scss`
		if (path.basename(filePath)[0] !== '_') {
			filePath = path.join(path.dirname(filePath), '_' + path.basename(filePath))

			if (await fs.pathExists(filePath)) {
				return filePath
			}
		}
	}

	// One issue here:
	//   If we rename `b.scss` to `_b.scss` in `node_modules`,
	//   we can't get file changing notification from VSCode,
	//   and we can't reload it from path because nothing changes in it.

	// So we need to validate if import paths exist after we got definition results.
	// Although we still can't get results in `_b.scss`.
	// TODO

	return null
}