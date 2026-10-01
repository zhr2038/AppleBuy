// Preload for C-004 CLI tests: no test may reach any non-loopback transport, even if the entry CLI regresses.
import { installNetworkGuard } from "../../src/netguard.ts";
const guard = installNetworkGuard();
process.on("exit", () => {
  if (guard.attempts.length) process.exitCode = 97;
});
