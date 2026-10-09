"""Codex-owned task dispatcher; no product/business implementation here."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid
from dispatch_lock import DispatchAlreadyRunning, dispatch_lease
from process_tree import OwnedProcess, ProcessTreeUnresolved

ROOT = Path(__file__).resolve().parents[2]
MODEL = "claude-opus-5-5"
EFFORT = "max"
# Codex dispatch boundary: a resumed session's compaction hint is not authority
# to read private transcripts. Read denies also cover Claude's Grep/Glob tools.
PRIVATE_READ_DENIES = ["Read(~/.claude/**)", "Read(~/.codex/**)", "Read(./.local/**)"]


def clean(value: str) -> str:
    value = re.sub(r"(?i)((?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie)\s*[:=]\s*)([^\s,;]+)", r"\1[REDACTED]", value)
    return re.sub(r"\bsk-ant-[A-Za-z0-9_-]+\b", "[REDACTED]", value)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def assert_terminal_records(outdir: Path) -> None:
    for record in outdir.glob("*.meta.json"):
        try:
            previous = json.loads(record.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise DispatchAlreadyRunning("An invocation record cannot be verified; inspect it before dispatch")
        if not isinstance(previous, dict) or previous.get("status") not in {"running", "returned_for_review", "failed"}:
            raise DispatchAlreadyRunning("An invocation record has an unrecognized terminal state")
        if previous["status"] == "running":
            raise DispatchAlreadyRunning("An earlier invocation is active or its terminal status is unresolved")


def run_task() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task")
    parser.add_argument("--profile", choices=["probe", "proposal", "implementation", "documentation", "review"], default="proposal")
    parser.add_argument("--resume")
    parser.add_argument("--turns", type=int, default=18)
    parser.add_argument("--timeout", type=int, default=720)
    parser.add_argument("--budget", type=float, default=3)
    parser.add_argument("--allow-command", action="append", default=[])
    args = parser.parse_args()
    executable = shutil.which("claude")
    if not executable:
        raise SystemExit("Claude Code executable is unavailable")
    outdir = ROOT / ".local" / "claude"
    outdir.mkdir(parents=True, exist_ok=True)
    run_id = f"{args.task}-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    session_id = args.resume or str(uuid.uuid4())
    command = [executable, "--print", "--model", MODEL, "--effort", EFFORT,
               "--output-format", "stream-json", "--verbose", "--max-turns", str(args.turns),
               "--max-budget-usd", str(args.budget), "--permission-mode", "dontAsk",
               "--permission-prompts", "none", "--setting-sources", "project,local",
               "--strict-mcp-config", "--disable-slash-commands", "--no-chrome",
               "--name", f"Apple Store {args.task}"]
    command += ["--disallowedTools", *PRIVATE_READ_DENIES]
    command += ["--resume" if args.resume else "--session-id", session_id]
    if args.profile == "probe":
        command += ["--safe-mode", "--tools", ""]
        prompt = "Reply exactly CLAUDE_CONNECTION_OK. No tool use, file changes, external actions, or explanations."
    else:
        taskpath = (ROOT / "docs" / "tasks" / f"{args.task}.md").resolve()
        if not taskpath.is_file() or not taskpath.is_relative_to(ROOT):
            raise SystemExit("Task sheet is missing or outside the project")
        tool_names = ["Read", "Glob", "Grep"]
        allows = ["Read", "Glob", "Grep"]
        if args.profile == "proposal":
            command += ["--restricted"]
            tool_names += ["WebFetch"]
            allows += ["WebFetch(domain:www.apple.com.cn)", "WebFetch(domain:support.apple.com)"]
        if args.profile == "implementation":
            tool_names += ["Write", "Edit", "Bash"]
            allows += ["Write", "Edit"]
        if args.profile == "documentation":
            tool_names += ["Write", "Edit"]
            allows += ["Write(./README.md)", "Edit(./README.md)",
                       "Write(./docs/claude/C-002-report.md)", "Edit(./docs/claude/C-002-report.md)"]
        if args.profile == "review" and args.allow_command:
            tool_names += ["Bash"]
        allows += [f"Bash({item})" for item in args.allow_command]
        command += ["--tools", ",".join(tool_names), "--allowedTools", *allows]
        prompt = (f"Read the complete task sheet at {taskpath} and its required context. "
                  "Execute only that task within E:\\Apple Store. Communicate in English. "
                  "Return a precise delivery report and disclose every limitation or permission denial. "
                  "Do not invoke other agents or expand authorization.")
    meta = {"task": args.task, "profile": args.profile, "cwd": str(ROOT), "session_id": session_id,
            "model_requested": MODEL, "effort_requested": EFFORT, "started_at": now(),
            "status": "running", "turn_budget": args.turns, "wall_budget_seconds": args.timeout,
            "cli_budget_usd": args.budget, "argv": command, "pid": None}
    metafile = outdir / f"{run_id}.meta.json"
    logfile = outdir / f"{run_id}.jsonl"
    resultfile = outdir / f"{run_id}.result.json"

    def save() -> None:
        temporary = metafile.with_name(metafile.name + "." + uuid.uuid4().hex + ".tmp")
        with temporary.open("w", encoding="utf-8") as receipt:
            receipt.write(json.dumps(meta, ensure_ascii=False, indent=2))
            receipt.flush()
            os.fsync(receipt.fileno())
        os.replace(temporary, metafile)

    save()
    print(json.dumps({"started": args.task, "session_id": session_id, "record": str(metafile)}), flush=True)
    started = time.monotonic()
    def on_started(pid: int) -> None:
        meta.update({"pid": pid, "process_tree": "Windows kill-on-close Job Object; child still suspended"})
        save()
    try:
        owned = OwnedProcess(command, ROOT, on_started)
    except ProcessTreeUnresolved as error:
        meta.update({"startup_error": type(error).__name__, "cleanup_confirmed": False, "status": "running"})
        save()
        print(json.dumps({"status": "unresolved", "record": str(metafile), "newDispatchBlocked": True}), flush=True)
        return 5
    except Exception as error:
        meta.update({"startup_error": type(error).__name__, "cleanup_confirmed": True, "status": "failed", "ended_at": now(), "result_path": None, "model_verified": False})
        save()
        print(json.dumps({"status": "failed", "startup_error": type(error).__name__, "record": str(metafile), "ownedProcessesRemaining": 0}), flush=True)
        return 1
    process = owned.process
    try:
        stdout, stderr, timed_out = owned.communicate(prompt, args.timeout)
        meta.update({"timed_out": timed_out, "cleanup_confirmed": True, "process_tree": "Windows kill-on-close Job Object; all owned exit signals confirmed"})
    except ProcessTreeUnresolved as error:
        meta.update({"communication_error": type(error).__name__, "cleanup_confirmed": False, "status": "running"})
        save()
        print(json.dumps({"status": "unresolved", "record": str(metafile), "newDispatchBlocked": True}), flush=True)
        return 5
    except Exception as error:
        meta.update({"communication_error": type(error).__name__, "cleanup_confirmed": True, "status": "failed", "ended_at": now(), "result_path": None, "model_verified": False})
        save()
        print(json.dumps({"status": "failed", "communication_error": type(error).__name__, "record": str(metafile), "ownedProcessesRemaining": 0}), flush=True)
        return 1
    logfile.write_text(clean(stdout), encoding="utf-8")
    (outdir / f"{run_id}.stderr.txt").write_text(clean(stderr), encoding="utf-8")
    result = None
    init = None
    events = 0
    assistant_models = set()
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        events += 1
        if event.get("type") == "system" and event.get("subtype") == "init":
            init = {key: event.get(key) for key in ("cwd", "model", "permissionMode", "session_id", "tools", "mcp_servers")}
        if event.get("type") == "result":
            result = event
        if event.get("type") == "assistant" and event.get("message", {}).get("model"):
            assistant_models.add(event["message"]["model"])
    if result:
        resultfile.write_text(clean(json.dumps(result, ensure_ascii=False, indent=2)), encoding="utf-8")
    models = list((result or {}).get("modelUsage", {}))
    # WebFetch's built-in page summarizer is accounted separately from the
    # assistant's model. Never accept a different primary or implementation model.
    auxiliary_models = [model for model in models if model != MODEL]
    allowed_auxiliary = args.profile == "proposal" and all(model.startswith("claude-haiku-") for model in auxiliary_models)
    primary_ok = (init or {}).get("model") == MODEL and assistant_models == {MODEL} and MODEL in models
    effective_ok = primary_ok and (not auxiliary_models or allowed_auxiliary)
    meta.update({"ended_at": now(), "exit_code": process.returncode, "duration_seconds": round(time.monotonic() - started, 2),
                 "events": events, "init": init, "models_actual": models, "model_verified": effective_ok,
                 "primary_models_actual": sorted(assistant_models), "auxiliary_models_actual": auxiliary_models,
                 "subtype": (result or {}).get("subtype"), "is_error": (result or {}).get("is_error"),
                 "permission_denials": (result or {}).get("permission_denials", []),
                 "result_path": str(resultfile) if result else None})
    success = (process.returncode == 0 and result and not result.get("is_error") and
               result.get("subtype") == "success" and effective_ok and not meta.get("timed_out"))
    meta["status"] = "returned_for_review" if success else "failed"
    save()
    summary = {key: meta.get(key) for key in ("task", "status", "exit_code", "session_id", "duration_seconds", "models_actual", "model_verified", "subtype", "is_error", "result_path")}
    # Keep exact denied inputs in the ignored receipt only; they can contain
    # private file names, transcript identifiers, or credential-bearing commands.
    summary["permission_denials"] = [{"tool_name": item.get("tool_name")} for item in meta.get("permission_denials", [])]
    summary["result_excerpt"] = clean(str((result or {}).get("result", "")))[:1800]
    if stderr:
        summary["stderr_excerpt"] = clean(stderr)[:600]
    # Windows pipe/console encodings may be GBK. Keep stdout ASCII-safe while UTF-8 files retain the full report.
    print(json.dumps(summary, ensure_ascii=True, indent=2), flush=True)
    return 0 if success else 1


def main() -> int:
    outdir = ROOT / ".local" / "claude"
    try:
        with dispatch_lease(outdir):
            # A killed dispatcher may leave its Claude child alive after the OS lease is released. Metadata that
            # never reached a terminal status therefore also blocks dispatch, until independently resolved.
            assert_terminal_records(outdir)
            return run_task()
    except DispatchAlreadyRunning as error:
        print(json.dumps({"status": "dispatch_refused", "reason": str(error), "newClaudeStarted": False}), flush=True)
        return 5


if __name__ == "__main__":
    sys.exit(main())
