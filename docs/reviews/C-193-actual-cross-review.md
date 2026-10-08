# C193 actual readonly host-scope review

The original terminal reviewer session returned **bounded AGREE** on the C192 candidate309 SHA f92846c11af09c3adc85baa94a467528a8e39bf247966c47b2c51ff9b9405eff. This is a sanitized account of the actual report; the raw returned report remains private. It covers only the worker startup scope probe and retained-source-read owner-loss check, not the whole repository, live order or goal.

Actual firstParty claude-opus-5-5/xhigh:122.25 seconds,21 turns,17/17 fresh complete EOF reads, three exact sequential foreground Bash commands. Structured modelUsage/provider/canonical model, CLI effort, source immutability and owned cleanup verified. No edits, private reads, permission denials, tool errors, timeout or cap error; no compaction reported. Resumed model usage is historical aggregate, not this round's spending.

Reviewer tests:16/16 focused (8 C192,3 startup,5 connection concurrency),108/108 protected runner,64 Python with no failures/errors/skips,1665/1665 full Node, before/after exact309 manifest. Root independently ran8 focused and the same108/64/1665 managed checks. Root reproduced one late-ready failure during the retained-source read and verified the correction after both awaits. No old protected assertions changed.

The reviewer traced the actual production chain: guarded runtime API, NativeCheckoutApi containsHost, fixed allowed RPC origin and Chrome permissions.contains. No permission request or expansion operation was added. Scope true/false/unknown is distinct. Unknown does not authorize renewal; renewal continues to check scope and all purchase conditions at action time.

Nonblocking limits retained:
- A physical lease can become unowned just before its close notification sets ownerLost; a brief ready message is possible, but every API call and ledger write still checks ownership.
- Timeout or mismatched reply makes the channel unusable; scope becomes unknown although startup can still report ready. No purchase can follow through that unusable channel.
- False means the declared wildcard is not fully granted, not absence of all narrower host grants.
- Desktop GUI currently ignores these fields; the private operator reads them.
- The new worker tests inject FAKE dependencies. No new composed probe-through-owner/API/peer test was run; that integration was traced in source, and existing peer wildcard tests passed. Worker false/unknown cases are helper-tested; worker integration directly covers true and two owner-loss points.

No personal Chrome, Apple, permission grant, mutation, ledger transition, real hold, order or speed was verified by Claude. Root accepts exactly this bounded software candidate; actual programme scope observation and unpaid-order proof remain outstanding.
