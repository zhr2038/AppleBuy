"""Own kernel lease and private atomic journal writer. No browser/profile access or PID/age recovery."""
import json
import os
from pathlib import Path
import sys
import uuid

MAGIC = b"APPLEBUY-OS-LEASE-v1\n"
TASK_KEY = "applebuy-single-personal-purchase/v1"

def emit(owned):
    print(json.dumps({"scope": "applebuy-owner-lease", "owned": owned}), flush=True)

def put_task(path, value):
    ledger = Path(str(path).removesuffix(".owner"))
    try:
        current = json.loads(ledger.read_text(encoding="utf-8"))
        if not isinstance(current, dict):
            raise ValueError()
    except FileNotFoundError:
        current = {}
    current[TASK_KEY] = value
    data = json.dumps(current, ensure_ascii=True).encode("utf-8")
    temporary = ledger.with_name(ledger.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, ledger)
    finally:
        temporary.unlink(missing_ok=True)

def open_owner(path):
    try:
        return path.open("r+b")
    except FileNotFoundError:
        temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".init")
        try:
            with temporary.open("xb") as output:
                output.write(MAGIC)
                output.flush()
                os.fsync(output.fileno())
            try:
                # A hard link publishes the complete header without replacing an existing owner.
                os.link(temporary, path)
            except FileExistsError:
                pass
        finally:
            temporary.unlink(missing_ok=True)
        return path.open("r+b")

def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        return 2
    handle = None
    locked = False
    try:
        path = Path(sys.argv[1])
        if not str(path).endswith(".owner"):
            return 2
        handle = open_owner(path)
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        locked = True
        handle.seek(0)
        existing = handle.read(len(MAGIC) + 1)
        # A legacy JSON/unknown marker is not evidence of an exited owner. Never rewrite it.
        if existing != MAGIC:
            emit(False)
            return 2
        emit(True)
        # This private pipe stays open for the lease lifetime. Parent death closes it;
        # a contained worker tree death also kills this holder and the OS releases the lock.
        while True:
            line = sys.stdin.readline(2_000_001)
            if not line or line == "release\n":
                break
            request = None
            try:
                if len(line.encode("utf-8")) > 2_000_000 or not line.endswith("\n"):
                    raise ValueError()
                request = json.loads(line)
                if request.get("action") != "put" or request.get("key") != TASK_KEY or not isinstance(request.get("value"), dict) or type(request.get("id")) is not int:
                    raise ValueError()
                put_task(path, request["value"])
                reply = {"scope": "applebuy-owner-lease", "id": request["id"], "ok": True}
            except (OSError, ValueError, TypeError, AttributeError):
                reply = {"scope": "applebuy-owner-lease", "id": request.get("id") if isinstance(request, dict) else None, "ok": False}
            print(json.dumps(reply), flush=True)
        return 0
    except (OSError, ValueError):
        emit(False)
        return 2
    finally:
        if handle:
            if locked:
                handle.seek(0)
                if os.name == "nt":
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            handle.close()

if __name__ == "__main__":
    raise SystemExit(main())
