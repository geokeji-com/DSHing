// 后端接口（与旧版完全一致，只是包了一层）

// 后端万一返回非 JSON（如网关错误页），给一句人话，而不是抛 SyntaxError
const j = async (r) => {
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { error: '后端返回异常（HTTP ' + r.status + '）' } }
}

const post = (url, body) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(j)

export const api = {
  tree: () => fetch('/api/tree').then(j),

  file: (path) => fetch('/api/file?path=' + encodeURIComponent(path)).then(j),

  // base：知识库自动保存时带上「编辑器对应的版本」，服务端用它和别人的修改做三方合并
  save: (path, content, base) =>
    fetch('/api/file', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, content, base }),
    }).then(j),

  rename: (path, name) => post('/api/file/rename', { path, name }),

  del: (path) =>
    fetch('/api/file?path=' + encodeURIComponent(path), { method: 'DELETE' }).then(j),

  // 知识库版本
  kbConfirm: (path, name, note) => post('/api/kb/confirm', { path, name, note }),
  kbDiscard: (path) => post('/api/kb/discard', { path }),
  kbPending: (path) => fetch('/api/kb/pending?path=' + encodeURIComponent(path)).then(j),
  kbHistory: (path) => fetch('/api/kb/history?path=' + encodeURIComponent(path)).then(j),
  kbVersion: (path, sha) => fetch('/api/kb/version?path=' + encodeURIComponent(path) + '&sha=' + sha).then(j),

  // 分享（一份资料一个长期链接）
  shareGet: (path) => fetch('/api/share?path=' + encodeURIComponent(path)).then(j),
  shareCreate: (path) => post('/api/share', { path }),
  shareClose: (id) => fetch('/api/share', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).then(j),
  shareReopen: (id) => post('/api/share/reopen', { id }),
  shareTake: (id) => post('/api/share/take', { id }),
  shareFinalize: (id, content) => post('/api/share/finalize', { id, content }),

  upload: (client, line, overwrite, files) =>
    fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client, line: line || null, overwrite, files }),
    }).then(j),
}
