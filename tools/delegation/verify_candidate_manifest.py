"""Read-only whole-candidate verifier, including public README and dispatch utilities. Never imports source."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIRS = {'src', 'entry', 'web', 'test', 'review', 'examples'}

def allowed(name):
    p = PurePosixPath(name)
    if '\\' in name or p.is_absolute() or '..' in p.parts or str(p) != name:
        return False
    return name in {'README.md', 'package.json'} or len(p.parts) >= 2 and p.parts[0] in SOURCE_DIRS or len(p.parts) == 3 and p.parts[:2] == ('tools', 'delegation') and p.suffix == '.py'

def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python tools/delegation/verify_candidate_manifest.py docs/reviews/<candidate-manifest.json>')
    manifest_path = (ROOT / sys.argv[1]).resolve()
    if not manifest_path.is_relative_to(ROOT / 'docs/reviews') or not manifest_path.name.endswith('candidate-manifest.json'):
        raise SystemExit('Manifest must be a project review candidate-manifest.json')
    m = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    files = m.get('files')
    if not isinstance(files, dict) or not files or len(files) > 500:
        raise SystemExit('Invalid candidate map')
    actual = {}
    for name, expected in files.items():
        if not isinstance(name, str) or not allowed(name) or not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
            raise SystemExit('Invalid or out-of-scope candidate entry')
        path = (ROOT / name).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file() or not allowed(path.relative_to(ROOT).as_posix()):
            raise SystemExit('Resolved candidate path is missing or out of scope')
        actual[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    mismatches = [n for n in sorted(files) if actual[n] != files[n]]
    fingerprint = hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    ok = not mismatches and fingerprint == m.get('sha256')
    print(json.dumps({'ok': ok, 'files': len(actual), 'sha256': fingerprint, 'mismatches': mismatches}, ensure_ascii=True))
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())
