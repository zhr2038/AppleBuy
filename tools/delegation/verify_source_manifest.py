"""Read-only reviewer utility: verify a project source manifest without importing or executing source."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIRS = {"src", "entry", "web", "test", "review", "examples"}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python tools/delegation/verify_source_manifest.py docs/reviews/<source-manifest.json>")
    manifest_path = (ROOT / sys.argv[1]).resolve()
    if not manifest_path.is_relative_to(ROOT / "docs" / "reviews") or not manifest_path.name.endswith("source-manifest.json"):
        raise SystemExit("Manifest must be a project review source-manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    files = manifest.get("files")
    if not isinstance(files, dict) or not files or len(files) > 500:
        raise SystemExit("Invalid source file map")
    actual: dict[str, str] = {}
    for name, expected in files.items():
        if not isinstance(name, str) or not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise SystemExit("Invalid source-manifest entry")
        lexical = PurePosixPath(name)
        if "\\" in name or lexical.is_absolute() or ".." in lexical.parts or str(lexical) != name:
            raise SystemExit("Source path must be a canonical relative path without traversal")
        if name != "package.json" and (len(lexical.parts) < 2 or lexical.parts[0] not in SOURCE_DIRS):
            raise SystemExit("Manifest includes a path outside the source scope")
        path = (ROOT / name).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise SystemExit("Source path is missing or outside the project")
        physical = path.relative_to(ROOT)
        if (name == "package.json" and physical.as_posix() != "package.json") or (name != "package.json" and (len(physical.parts) < 2 or physical.parts[0] not in SOURCE_DIRS)):
            raise SystemExit("Resolved source path is outside the source scope")
        actual[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    mismatches = [name for name in sorted(files) if actual[name] != files[name]]
    fingerprint = hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    ok = not mismatches and fingerprint == manifest.get("sha256")
    print(json.dumps({"ok": ok, "files": len(actual), "sha256": fingerprint, "mismatches": mismatches}, ensure_ascii=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
