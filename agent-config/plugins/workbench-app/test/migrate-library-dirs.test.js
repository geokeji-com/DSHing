import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, readlinkSync, readdirSync,
  renameSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { planMigration, applyMigration, planRollback, rollbackMigration } from '../scripts/migrate-library-dirs.mjs'

const mapping = [{ client_key: 'CUS-A', display_name: '猿编程' }, { client_key: 'CUS-B', display_name: '移山科技' }]
const script = fileURLToPath(new URL('../scripts/migrate-library-dirs.mjs', import.meta.url))
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-m6-migrate-')), root = join(dir, 'library'), manifest = join(dir, 'rollback.json')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(root)
  for (const { display_name } of mapping) {
    mkdirSync(join(root, display_name, '草稿', 'nested'), { recursive: true })
    writeFileSync(join(root, display_name, 'ready.md'), 'Ready\n\0unchanged')
    writeFileSync(join(root, display_name, '草稿', 'nested', 'draft.md'), '草稿原文')
    symlinkSync('ready.md', join(root, display_name, 'article-alias'))
  }
  const input = join(dir, 'mapping.json')
  writeFileSync(input, JSON.stringify(mapping))
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  return { dir, root, manifest, input, run }
}
function snapshot(root) {
  const result = {}
  function visit(path, prefix = '') {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name), key = join(prefix, name), stat = lstatSync(full)
      result[key] = { ino: stat.ino, mode: stat.mode, mtimeMs: stat.mtimeMs,
        content: stat.isFile() ? readFileSync(full).toString('base64') : null,
        link: stat.isSymbolicLink() ? readlinkSync(full) : null }
      if (stat.isDirectory()) visit(full, key)
    }
  }
  visit(root)
  return result
}

test('CLI defaults to dry-run, plans all renames, and makes no filesystem changes', t => {
  const f = fixture(t), before = snapshot(f.root)
  const result = f.run('--root', f.root, '--mapping', f.input, '--manifest', f.manifest)
  assert.equal(result.status, 0, result.stderr)
  const plan = JSON.parse(result.stdout)
  assert.equal(plan.mode, 'DRY-RUN')
  assert.equal(plan.operations.length, 2)
  assert.deepEqual(snapshot(f.root), before)
  assert.equal(existsSync(f.manifest), false)
})

test('apply preserves file bytes, inode, mode and timestamps; relative aliases and rollback restore the exact tree', t => {
  const f = fixture(t), before = snapshot(f.root)
  const applied = f.run('--root', f.root, f.input, '--apply', '--manifest', f.manifest)
  assert.equal(applied.status, 0, applied.stderr)
  const manifest = JSON.parse(readFileSync(f.manifest, 'utf8'))
  assert.equal(manifest.status, 'applied')
  assert.equal(manifest.operations.length, 2)
  for (const { client_key, display_name } of mapping) {
    assert.equal(readlinkSync(join(f.root, display_name)), client_key)
    assert.equal(lstatSync(join(f.root, client_key)).isDirectory(), true)
    for (const suffix of ['ready.md', 'article-alias', '草稿/nested/draft.md']) {
      const stat = lstatSync(join(f.root, client_key, suffix))
      const old = before[join(display_name, suffix)]
      assert.equal(stat.ino, old.ino)
      assert.equal(stat.mode, old.mode)
      assert.equal(stat.mtimeMs, old.mtimeMs)
    }
    assert.equal(readFileSync(join(f.root, display_name, 'ready.md'), 'utf8'), 'Ready\n\0unchanged')
  }
  assert.equal(planMigration(f.root, mapping).operations.length, 0)
  assert.equal(planMigration(f.root, mapping).skipped.length, 2)
  const rollbackDryRun = f.run('--rollback', f.manifest, '--dry-run')
  assert.equal(rollbackDryRun.status, 0, rollbackDryRun.stderr)
  assert.equal(lstatSync(join(f.root, '猿编程')).isSymbolicLink(), true)
  const rollback = f.run('--rollback', f.manifest)
  assert.equal(rollback.status, 0, rollback.stderr)
  assert.equal(JSON.parse(rollback.stdout).reversed, 2)
  assert.deepEqual(snapshot(f.root), before)
  assert.equal(rollbackMigration(f.manifest).reversed, 0)
})

for (const kind of ['directory', 'file', 'symlink', 'dangling']) {
  test(`apply refuses an occupied key (${kind}) before any earlier row is moved`, t => {
    const f = fixture(t), occupied = join(f.root, 'CUS-B')
    if (kind === 'directory') mkdirSync(occupied)
    if (kind === 'file') writeFileSync(occupied, 'do not touch')
    if (kind === 'symlink') symlinkSync('移山科技', occupied)
    if (kind === 'dangling') symlinkSync('missing', occupied)
    const before = snapshot(f.root)
    assert.throws(() => applyMigration(f.root, mapping, f.manifest), /conflict/)
    assert.deepEqual(snapshot(f.root), before)
    assert.equal(existsSync(f.manifest), false)
  })
}

test('mapping rejects duplicates, overlapping names/keys, malformed rows and traversal before writes', t => {
  const f = fixture(t), before = snapshot(f.root)
  for (const rows of [null, {}, [null], [mapping[0], mapping[0]],
    [{ client_key: 'same', display_name: 'same' }],
    [mapping[0], { client_key: 'CUS-B', display_name: 'CUS-A' }],
    ...['', '..', '.', '../outside', 'nested/name', 'nested\\name', 'bad\0name'].flatMap(value => [
      [{ client_key: value, display_name: '猿编程' }], [{ client_key: 'CUS-A', display_name: value }],
    ]),
  ]) assert.throws(() => applyMigration(f.root, rows, f.manifest))
  assert.deepEqual(snapshot(f.root), before)
  assert.equal(existsSync(f.manifest), false)
})

test('existing manifests and manifests inside the library are refused before rename', t => {
  const f = fixture(t), before = snapshot(f.root)
  assert.throws(() => applyMigration(f.root, mapping), /manifest/)
  assert.throws(() => applyMigration(f.root, mapping, join(f.root, 'rollback.json')), /outside/)
  symlinkSync(f.root, join(f.dir, 'root-alias'))
  assert.throws(() => applyMigration(f.root, mapping, join(f.dir, 'root-alias', 'rollback.json')), /outside/)
  writeFileSync(f.manifest, 'existing manifest')
  assert.throws(() => applyMigration(f.root, mapping, f.manifest))
  assert.equal(readFileSync(f.manifest, 'utf8'), 'existing manifest')
  assert.deepEqual(snapshot(f.root), before)
})

test('unexpected display-name symlinks and files are conflicts, including dangling aliases', t => {
  const f = fixture(t)
  for (const kind of ['file', 'symlink', 'dangling']) {
    const name = 'bad-' + kind, path = join(f.root, name)
    if (kind === 'file') writeFileSync(path, 'private')
    else symlinkSync(kind === 'symlink' ? '猿编程' : 'missing', path)
    assert.throws(() => planMigration(f.root, [{ client_key: 'CUS-new', display_name: name }]), /conflict/)
  }
  const skipped = planMigration(f.root, [{ client_key: 'CUS-new', display_name: 'missing' }])
  assert.equal(skipped.skipped[0].reason, 'missing')
})

test('rollback preflights all rows and refuses replaced aliases or directories without changes', t => {
  const f = fixture(t)
  applyMigration(f.root, mapping, f.manifest)
  unlinkSync(join(f.root, '猿编程'))
  symlinkSync('CUS-B', join(f.root, '猿编程'))
  const before = snapshot(f.root)
  assert.throws(() => rollbackMigration(f.manifest), /alias conflict/)
  assert.deepEqual(snapshot(f.root), before)
  renameSync(join(f.root, 'CUS-B'), join(f.dir, 'saved'))
  mkdirSync(join(f.root, 'CUS-B'))
  const replaced = snapshot(f.root)
  assert.throws(() => rollbackMigration(f.manifest), /directory conflict/)
  assert.deepEqual(snapshot(f.root), replaced)
})

test('rollback recovers a partial apply after rename and leaves untouched planned rows alone', t => {
  const f = fixture(t), before = snapshot(f.root)
  const plan = planMigration(f.root, mapping)
  writeFileSync(f.manifest, JSON.stringify({ ...plan, status: 'applying' }))
  renameSync(join(f.root, '猿编程'), join(f.root, 'CUS-A'))
  assert.equal(planRollback(f.manifest).operations.length, 1)
  rollbackMigration(f.manifest)
  assert.deepEqual(snapshot(f.root), before)
})

test('rollback recovers a partial apply after symlink and preserves files added since migration', t => {
  const f = fixture(t), plan = planMigration(f.root, mapping)
  writeFileSync(f.manifest, JSON.stringify({ ...plan, status: 'applying' }))
  renameSync(join(f.root, '猿编程'), join(f.root, 'CUS-A'))
  symlinkSync('CUS-A', join(f.root, '猿编程'))
  writeFileSync(join(f.root, 'CUS-A', 'new.md'), 'post-migration')
  rollbackMigration(f.manifest)
  assert.equal(readFileSync(join(f.root, '猿编程', 'new.md'), 'utf8'), 'post-migration')
  assert.equal(readFileSync(join(f.root, '移山科技', 'ready.md'), 'utf8'), 'Ready\n\0unchanged')
})

test('rollback refuses a replaced library root and malformed manifests', t => {
  const f = fixture(t)
  applyMigration(f.root, mapping, f.manifest)
  renameSync(f.root, join(f.dir, 'original-root'))
  mkdirSync(f.root)
  assert.throws(() => rollbackMigration(f.manifest), /root changed/)
  writeFileSync(f.manifest, JSON.stringify({ version: 100, operations: [] }))
  assert.throws(() => rollbackMigration(f.manifest), /Invalid/)
})

test('CLI rejects contradictory or incomplete arguments before mutation', t => {
  const f = fixture(t), before = snapshot(f.root)
  for (const args of [[], ['--root'], ['--unknown'], ['--apply', '--dry-run'],
    ['--rollback', f.manifest, '--root', f.root], ['--mapping', f.input, f.input],
    ['--mapping', f.input, '--root', f.root, '--apply']]) {
    const result = f.run(...args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Migration refused/)
  }
  assert.deepEqual(snapshot(f.root), before)
})
