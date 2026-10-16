#!/usr/bin/env node
import {
  closeSync, fsyncSync, lstatSync, openSync, readFileSync, readlinkSync,
  realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const fail = message => { throw new Error(message) }
const identity = stat => ({ dev: stat.dev, ino: stat.ino })
const same = (stat, saved) => stat && saved && stat.dev === saved.dev && stat.ino === saved.ino
function entry(path) {
  try { return lstatSync(path) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
function component(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value === '.' || value === '..'
      || /[/\\\x00-\x1f]/.test(value)) fail('Invalid mapping directory component')
  return value
}
function mappingRows(mapping) {
  if (!Array.isArray(mapping)) fail('Mapping must be an array of {client_key, display_name}')
  const used = new Set()
  return mapping.map(row => {
    const client_key = component(row?.client_key), display_name = component(row?.display_name)
    for (const name of [client_key, display_name]) {
      if (used.has(name)) fail(`Conflicting mapping component: ${name}`)
      used.add(name)
    }
    return { client_key, display_name }
  })
}

/** Read-only preflight of the entire mapping, including dangling symlinks. */
export function planMigration(root, mapping) {
  root = realpathSync(root)
  const rootStat = lstatSync(root)
  if (!rootStat.isDirectory()) fail('Library root must be a directory')
  const rows = mappingRows(mapping)
  const operations = [], skipped = []
  for (const row of rows) {
    const oldPath = join(root, row.display_name), newPath = join(root, row.client_key)
    const old = entry(oldPath), next = entry(newPath)
    if (old?.isDirectory() && !next) {
      operations.push({ ...row, directory: identity(old) })
    } else if (old?.isSymbolicLink() && readlinkSync(oldPath) === row.client_key && next?.isDirectory()) {
      skipped.push({ ...row, reason: 'already-migrated' })
    } else if (!old && (!next || next.isDirectory())) {
      skipped.push({ ...row, reason: next ? 'keyed-only' : 'missing' })
    } else {
      fail(`Directory conflict: ${row.display_name} / ${row.client_key}`)
    }
  }
  return { version: 1, root, rootIdentity: identity(rootStat), operations, skipped }
}

// Journal metadata is the only file we write. Articles are only moved with
// their parent directory. Publish each journal update atomically and fsync it.
function writeManifest(path, manifest, first = false) {
  const temporary = first ? path : path + '.' + randomUUID() + '.tmp'
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, JSON.stringify(manifest, null, 2) + '\n')
    fsyncSync(fd)
  } finally { closeSync(fd) }
  if (!first) renameSync(temporary, path)
}

function manifestPath(path, root) {
  if (!path) fail('--manifest is required with --apply')
  const canonical = join(realpathSync(dirname(resolve(path))), basename(path))
  const rel = relative(root, canonical)
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'))) {
    fail('Manifest must be outside the library root')
  }
  return canonical
}

export function applyMigration(root, mapping, path) {
  const plan = planMigration(root, mapping)
  path = manifestPath(path, plan.root)
  // Exclusive creation also refuses an existing or dangling manifest symlink.
  const manifest = { ...plan, status: 'applying' }
  writeManifest(path, manifest, true)
  for (const operation of manifest.operations) {
    const oldPath = join(plan.root, operation.display_name), newPath = join(plan.root, operation.client_key)
    if (!same(entry(oldPath), operation.directory) || entry(newPath)) fail('Directory changed after preflight; use rollback manifest')
    renameSync(oldPath, newPath)
    // The prewritten directory identity also covers interruption here.
    symlinkSync(operation.client_key, oldPath, 'dir')
    operation.link = identity(lstatSync(oldPath))
    writeManifest(path, manifest)
  }
  manifest.status = 'applied'
  writeManifest(path, manifest)
  return manifest
}

/** Validate every inverse before changing anything. Handles interrupted apply
 * or rollback using the directory identity saved before the first rename. */
export function planRollback(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.operations)
      || typeof manifest.root !== 'string' || !isAbsolute(manifest.root)) fail('Invalid rollback manifest')
  mappingRows(manifest.operations)
  const root = entry(manifest.root)
  if (!root?.isDirectory() || !same(root, manifest.rootIdentity)) fail('Library root changed since migration')
  const operations = []
  for (const operation of [...manifest.operations].reverse()) {
    const oldPath = join(manifest.root, operation.display_name), newPath = join(manifest.root, operation.client_key)
    const old = entry(oldPath), next = entry(newPath)
    if (old?.isDirectory() && same(old, operation.directory) && !next) continue
    if (!next?.isDirectory() || !same(next, operation.directory)) fail(`Rollback directory conflict: ${operation.client_key}`)
    if (old && (!old.isSymbolicLink() || readlinkSync(oldPath) !== operation.client_key
        || (operation.link && !same(old, operation.link)))) fail(`Rollback alias conflict: ${operation.display_name}`)
    operations.push({ ...operation, removeLink: Boolean(old) })
  }
  return { manifest, operations }
}

export function rollbackMigration(path) {
  if (!entry(path)?.isFile()) fail('Rollback manifest must be a real file')
  const { manifest, operations } = planRollback(path)
  for (const operation of operations) {
    const oldPath = join(manifest.root, operation.display_name), newPath = join(manifest.root, operation.client_key)
    if (operation.removeLink) unlinkSync(oldPath) // Only the validated name symlink.
    renameSync(newPath, oldPath)
  }
  manifest.status = 'rolled-back'
  writeManifest(path, manifest)
  return { ...manifest, reversed: operations.length }
}

export function main(argv = process.argv.slice(2)) {
  const options = {}, positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (['--apply', '--dry-run', '--help'].includes(arg)) options[arg.slice(2)] = true
    else if (['--root', '--mapping', '--manifest', '--rollback'].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`Missing value for ${arg}`)
      if (options[arg.slice(2)]) fail(`Duplicate option: ${arg}`)
      options[arg.slice(2)] = argv[++i]
    } else if (arg.startsWith('-')) fail(`Unknown option: ${arg}`)
    else positional.push(arg)
  }
  if (options.help) {
    process.stdout.write('Usage: migrate-library-dirs.mjs --mapping clients.json [--root DIR] [--apply --manifest FILE]\n'
      + '       migrate-library-dirs.mjs --rollback FILE [--dry-run]\n')
    return
  }
  if (options.apply && options['dry-run']) fail('--apply conflicts with --dry-run')
  if (options.rollback) {
    if (options.mapping || options.root || options.manifest || options.apply || positional.length) fail('--rollback accepts only a manifest and optional --dry-run')
    const result = options['dry-run'] ? planRollback(options.rollback) : rollbackMigration(options.rollback)
    process.stdout.write(JSON.stringify({ mode: options['dry-run'] ? 'DRY-RUN rollback' : 'ROLLBACK', ...result }, null, 2) + '\n')
    return
  }
  if (positional.length > 1 || (options.mapping && positional.length)) fail('Provide one mapping JSON file')
  const input = options.mapping || positional[0]
  if (!input) fail('Mapping JSON file is required; use --help')
  const mapping = JSON.parse(readFileSync(input, 'utf8'))
  const root = options.root || process.env.DSH_WORKBENCH_LIBRARY_ROOT || '/srv/dsh-data/文章库'
  const result = options.apply ? applyMigration(root, mapping, options.manifest) : planMigration(root, mapping)
  process.stdout.write(JSON.stringify({ mode: options.apply ? 'APPLY' : 'DRY-RUN', ...result }, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (error) {
    process.stderr.write(`Migration refused: ${error.message}\n`)
    process.exitCode = 1
  }
}
