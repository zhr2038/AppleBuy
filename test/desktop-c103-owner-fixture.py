"""Test-only timing/failure injection around the actual holder, using isolated fixture paths."""
import os
from pathlib import Path
import runpy
import sys

source, owner, mode = sys.argv[1:]
assert Path(owner).resolve().is_relative_to(Path('.local/test-runs').resolve())
original_open = Path.open
missing_seen = False
def fixture_open(path, *args, **kwargs):
    global missing_seen
    try:
        handle = original_open(path, *args, **kwargs)
    except FileNotFoundError:
        if mode in ('atomic-first','atomic-second') and not missing_seen and str(path) == owner and args and args[0] == 'r+b':
            missing_seen = True
            print('{"fixture":"missing-marker"}', flush=True)
            assert sys.stdin.readline() == 'continue\n'
        raise
    if mode == 'first' and str(path) == owner and args and args[0] == 'x+b':
        print('{"fixture":"created-empty"}', flush=True)
        assert sys.stdin.readline() == 'continue\n'
    return handle
Path.open = fixture_open
if mode in ('atomic-first','atomic-second'):
    def publication(original):
        def publish(source, destination, *args, **kwargs):
            try:
                value = original(source, destination, *args, **kwargs)
            except FileExistsError:
                print('{"fixture":"publication-lost"}', flush=True)
                raise
            print('{"fixture":"header-published"}', flush=True)
            assert sys.stdin.readline() == 'continue\n'
            return value
        return publish
    os.link = publication(os.link)
    os.rename = publication(os.rename)
if os.name == 'nt' and mode in ('second','atomic-second'):
    import msvcrt
    original_lock = msvcrt.locking
    def fixture_lock(fd, operation, count):
        result = original_lock(fd, operation, count)
        if operation == msvcrt.LK_NBLCK:
            print('{"fixture":"second-lock-held"}', flush=True)
            assert sys.stdin.readline() == 'continue\n'
        return result
    msvcrt.locking = fixture_lock
if mode == 'replace-failure':
    def fail_replace(*args, **kwargs):
        raise PermissionError('FAKE fixture replacement denied')
    os.replace = fail_replace
sys.argv = [source, owner]
runpy.run_path(source, run_name='__main__')
