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

ROOT = Path(__file__).resolve().parents[2]
MODEL = "claude-opus-5-5"
EFFORT = "xhigh"


def clean(value: str) -> str:
    value = re.sub(r"(?i)((?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie)\s*[:=]\s*)([^\s,;]+)", r"\1[REDACTED]", value)
    return re.sub(r"\bsk-ant-[A-Za-z0-9_-]+\b", "[REDACTED]", value)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


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
        metafile.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    save()
    print(json.dumps({"started": args.task, "session_id": session_id, "record": str(metafile)}), flush=True)
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               encoding="utf-8", errors="replace", creationflags=flags)
    meta["pid"] = process.pid
    save()
    # communicate(timeout=...) enforces a wall budget without orphaning a second implementer.
    started = time.monotonic()
    try:
        stdout, stderr = process.communicate(input=prompt, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        process.terminate()
        try:
            stdout, stderr = process.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
        meta["timed_out"] = True
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
    summary = {key: meta.get(key) for key in ("task", "status", "exit_code", "session_id", "duration_seconds", "models_actual", "model_verified", "subtype", "is_error", "permission_denials", "result_path")}
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
            for record in outdir.glob("*.meta.json"):
                try:
                    previous = json.loads(record.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    raise DispatchAlreadyRunning("An invocation record cannot be verified; inspect it before dispatch")
                if previous.get("status") == "running":
                    raise DispatchAlreadyRunning("An earlier invocation is active or its terminal status is unresolved")
            return run_task()
    except DispatchAlreadyRunning as error:
        print(json.dumps({"status": "dispatch_refused", "reason": str(error), "newClaudeStarted": False}), flush=True)
        return 5


if __name__ == "__main__":
    sys.exit(main())
