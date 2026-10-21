# WB draft/confirm parity (R2) — done

- Commit: `9fc3044` (`feat(workbench): MCP server fallback + MCP draft list/confirm parity`)
- PR: https://github.com/geokeji-com/DSHing/pull/5
- Branch: `wb-draft-parity-workbench`

## Files changed

- `agent-config/plugins/workbench-app/lib/impl.js`
- `agent-config/plugins/workbench-app/lib/client.js`
- `agent-config/plugins/workbench-app/cordis.patch.yml`
- `agent-config/plugins/workbench-app/README.md`
- `agent-config/plugins/workbench-app/package.json`
- `agent-config/plugins/workbench-app/test/impl.test.js`

## Smoke / checks

- `node --check agent-config/plugins/workbench-app/lib/impl.js`
- `node --check agent-config/plugins/workbench-app/lib/client.js`
- `npm test` in `agent-config/plugins/workbench-app` (3 tests green)
- `git diff --check`
- In-memory fake-host smoke verified formal `articles` resolution, MCP draft list merge, Support-only `read_article`, and confirm `write_article(draft:false)`.

## Not done

- No dsh-cloud Support changes; those are covered by the companion Support PR.
- No merge, deploy, Noah-host changes, or skill marketing/body edits.
