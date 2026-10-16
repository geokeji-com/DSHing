import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const customers = ['A', 'B'].map(client_key => ({ client_key,
  business_lines: [{ id: `${client_key}1` }, { id: `${client_key}2` }],
  service_periods: [{ id: `${client_key}p1`, business_line_id: `${client_key}1` },
    { id: `${client_key}p2`, business_line_id: `${client_key}2` }] }));
const value = key => ({ client_key: key, business_line_id: `${key}2`, service_period_id: `${key}p2` });
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const storage = new Map(), calls = [], picks = [];
  let api, resolve, changed = false;
  vm.runInNewContext(source.replace('return module.exports;', 'return { wbRestoreCurrentClient, wbRememberCurrentClient, wbAllowedPick };'), {
    window: { __ModuleLoader__: { load({ factory }) { api = factory(() => ({})); } } },
    document: { cookie: 'publish_studio_web_csrf=fixture-csrf' },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, v) => storage.set(key, v) },
    fetch(url, options) {
      calls.push({ url, options });
      return options.method === 'POST' ? Promise.reject(Error('offline')) : new Promise(r => { resolve = r; });
    },
  });
  return { api, calls, storage, picks,
    restore: () => api.wbRestoreCurrentClient(customers, 'u', p => picks.push(JSON.parse(JSON.stringify(p))), () => changed),
    choose: async key => { changed = true; return api.wbRememberCurrentClient('u', { key, line: `${key}2`, period: `${key}p2` }); },
    finish: v => resolve({ ok: true, json: async () => ({ currentClient: v }) }),
  };
}

test('shared allowed client restores the M2 line and period IDs', async () => {
  const f = fixture(); f.restore(); f.finish(value('B')); await flush();
  assert.deepEqual(f.picks.at(-1), { key: 'B', line: 'B2', period: 'Bp2' });
  assert.equal(f.api.wbAllowedPick(customers, { client_key: 'B', service_period_id: 'Bp2' }).period, 'Bp2');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/api/v1/me/current-client');
});

test('sessionStorage wins, is uid-scoped, and stale clients/IDs fall back to the allowed list', async () => {
  for (const [stored, remote, expected] of [[value('A'), value('B'), 'A'], [value('denied'), value('B'), 'B'], [null, value('denied'), 'A']]) {
    const f = fixture(); f.storage.set('dsh:current-client:tab:u', JSON.stringify(stored));
    f.storage.set('dsh:current-client:tab:other', JSON.stringify(value('A')));
    f.restore(); f.finish(remote); await flush(); assert.equal(f.picks.at(-1).key, expected);
  }
  const f = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(f.api.wbAllowedPick(customers, { client_key: 'B', business_line_id: 'A2', service_period_id: 'Ap2' }))),
    { key: 'B', line: 'B1', period: 'Bp1' });
});

test('manual picks win the load race, dual-write tab state and send CSRF; errors are ignored', async () => {
  const f = fixture(); f.restore(); const before = f.picks.length;
  const posted = f.choose('A');
  assert.equal(JSON.parse(f.storage.get('dsh:current-client:tab:u')).client_key, 'A');
  f.finish(value('B')); await posted; await flush();
  assert.equal(f.picks.length, before);
  const request = f.calls.at(-1);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['X-CSRF-Token'], 'fixture-csrf');
  assert.deepEqual(JSON.parse(request.options.body), { ...value('A'), source: 'workbench' });
  // A failed write does not poison the next selection's write queue.
  await f.choose('B'); assert.equal(JSON.parse(f.calls.at(-1).options.body).client_key, 'B');
});

test('unmount cancels applying a late server selection', async () => {
  const f = fixture(); const cancel = f.restore(); cancel();
  f.finish(value('B')); await flush(); assert.equal(f.picks.at(-1).key, 'A');
});
