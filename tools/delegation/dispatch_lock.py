"""Codex-owned OS lease: only one dispatcher in this checkout may launch Claude."""
from contextlib import contextmanager
from pathlib import Path
import os


class DispatchAlreadyRunning(RuntimeError):
    pass


@contextmanager
def dispatch_lease(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    # Keep the inode/file identity stable. Never unlink the lock file; a stale filename is not a held OS lease.
    handle = (directory / 'dispatcher.lock').open('a+b')
    locked = False
    try:
        if handle.seek(0, 2) == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise DispatchAlreadyRunning('Another Claude dispatcher holds this workspace lease') from error
        locked = True
        yield
    finally:
        if locked:
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()
