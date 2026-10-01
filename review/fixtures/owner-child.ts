// Codex-owned local test fixture. Only its parent test starts/stops this known Node child.
import { acquireOwnership } from "../../src/app/owner-lock.ts";

const [taskDir, ownerId, delay] = process.argv.slice(2);
if (!taskDir || !ownerId) throw new Error("Missing reviewer fixture arguments");
const result = await acquireOwnership(taskDir, ownerId, () => ({ fake: true, pendingOperation: true }), { statusDelayMs: Number(delay) });
if (!result.ok) {
  console.log(JSON.stringify({ ok: false, reason: result.reason, status: "status" in result ? result.status.kind : null }));
} else {
  console.log(JSON.stringify({ ok: true, previous: result.previous.kind }));
  const keepAlive = setInterval(() => {}, 1000);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (input: string) => {
    if (input.trim() !== "RELEASE_REVIEW_FIXTURE") return;
    await result.lock.release();
    clearInterval(keepAlive);
    process.stdin.destroy();
  });
}
