"""Offline operator CLI checks: only temporary article fixtures are touched."""

import json
import os
from pathlib import Path
import subprocess

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / "agent-config/plugins/workbench-app/scripts/migrate-library-dirs.mjs"


@pytest.fixture
def library(tmp_path):
    root = tmp_path / "library"
    draft = root / "客户显示名" / "草稿" / "article.md"
    draft.parent.mkdir(parents=True)
    draft.write_bytes(b"# Temporary fixture\n\x00unchanged")
    mapping = tmp_path / "clients.json"
    mapping.write_text(json.dumps([{"client_key": "CUS-TEST", "display_name": "客户显示名"}]))
    manifest = tmp_path / "rollback.json"

    def run(*args):
        return subprocess.run(
            ["node", str(SCRIPT), *map(str, args)],
            env={"PATH": os.environ["PATH"], "DSH_WORKBENCH_LIBRARY_ROOT": str(root)},
            capture_output=True, text=True, timeout=15, check=False,
        )

    return root, draft, mapping, manifest, run


def test_default_dry_run_and_apply_requires_external_manifest(library):
    root, draft, mapping, manifest, run = library
    before = draft.read_bytes(), draft.stat().st_ino
    result = run(mapping)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["mode"] == "DRY-RUN"
    assert not manifest.exists()
    assert not (root / "CUS-TEST").exists()
    for args in [(mapping, "--apply"), (mapping, "--apply", "--manifest", root / "manifest.json")]:
        result = run(*args)
        assert result.returncode == 1
        assert "manifest" in result.stderr.lower()
        assert (draft.read_bytes(), draft.stat().st_ino) == before
        assert not (root / "CUS-TEST").exists()


def test_apply_and_rollback_preserve_article_and_refuse_manifest_reuse(library):
    root, draft, mapping, manifest, run = library
    before = draft.read_bytes(), draft.stat().st_ino
    result = run(mapping, "--apply", "--manifest", manifest)
    assert result.returncode == 0, result.stderr
    assert (root / "客户显示名").is_symlink()
    assert os.readlink(root / "客户显示名") == "CUS-TEST"
    assert (draft.read_bytes(), draft.stat().st_ino) == before
    journal = manifest.read_bytes()
    result = run(mapping, "--apply", "--manifest", manifest)
    assert result.returncode == 1
    assert manifest.read_bytes() == journal
    result = run("--rollback", manifest)
    assert result.returncode == 0, result.stderr
    assert not (root / "客户显示名").is_symlink()
    assert not (root / "CUS-TEST").exists()
    assert (draft.read_bytes(), draft.stat().st_ino) == before
