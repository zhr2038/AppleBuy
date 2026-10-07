"""Own kernel lease and private atomic journal writer. No browser/profile access or PID/age recovery."""
import json
import os
from pathlib import Path
import sys
import uuid
import base64
import hashlib
import re
import time

MAGIC = b"APPLEBUY-OS-LEASE-v1\n"
TASK_KEY = "applebuy-single-personal-purchase/v1"
MAX_VALUE_BYTES = 16_000_000
MAX_CHUNK_BYTES = 48_000

class ChunkedPut:
    """Only a complete, sequential, bounded, hashed value reaches the existing atomic writer."""
    def __init__(self):
        self.stage = None

    def receive(self, path, request):
        if not isinstance(request, dict) or type(request.get("id")) is not int or request["id"] <= 0:
            raise ValueError()
        action = request.get("action")
        if self.stage and time.monotonic() - self.stage["at"] > 30:
            raise ValueError()
        if action == "put":
            if self.stage or request.get("key") != TASK_KEY or not isinstance(request.get("value"), dict):
                raise ValueError()
            put_task(path, request["value"])
            return True
        if action == "putBegin":
            if self.stage or set(request) != {"action", "id", "key", "bytes", "sha256"} or request.get("key") != TASK_KEY or type(request.get("bytes")) is not int or not 0 < request["bytes"] <= MAX_VALUE_BYTES or not isinstance(request.get("sha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", request["sha256"]):
                raise ValueError()
            self.stage = {"id":request["id"], "bytes":request["bytes"], "sha256":request["sha256"], "data":bytearray(), "seq":0, "at":time.monotonic()}
            return None
        stage = self.stage
        if not stage or request["id"] != stage["id"]:
            raise ValueError()
        if action == "putChunk":
            if set(request) != {"action", "id", "seq", "data"} or type(request.get("seq")) is not int or request["seq"] != stage["seq"] or not isinstance(request.get("data"), str) or len(request["data"]) > 64_000:
                raise ValueError()
            data = base64.b64decode(request["data"], validate=True)
            if not data or len(data) != min(MAX_CHUNK_BYTES, stage["bytes"] - len(stage["data"])):
                raise ValueError()
            stage["data"].extend(data)
            stage["seq"] += 1
            return None
        if action == "putCommit":
            if set(request) != {"action", "id"} or len(stage["data"]) != stage["bytes"] or hashlib.sha256(stage["data"]).hexdigest() != stage["sha256"]:
                raise ValueError()
            value = json.loads(stage["data"].decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError()
            put_task(path, value)
            self.stage = None
            return True
        raise ValueError()

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
        transaction = ChunkedPut()
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
                done = transaction.receive(path, request)
                if done is None:
                    continue
                reply = {"scope": "applebuy-owner-lease", "id": request["id"], "ok": True}
            except (OSError, ValueError, TypeError, AttributeError):
                failed_id = transaction.stage["id"] if transaction.stage else request.get("id") if isinstance(request, dict) else None
                transaction.stage = None
                reply = {"scope": "applebuy-owner-lease", "id": failed_id, "ok": False}
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
