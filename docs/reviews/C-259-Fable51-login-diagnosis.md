# C259 actual Claude Fable 5.1 / max login diagnosis

Actual English read-only response. Verified first-party canonical model `claude-fable-5-1`, CLI effort `max`, successful result, 597.20 seconds, 10 turns. Nine complete Read calls: the task and all eight required files; no commands, edits, network, agents, permission denials or private reads. Source map unchanged. This is diagnosis, not implementation acceptance or successful login/order verification.

## Codex assessment

The current evidence establishes the failing merchant handoff, not an exclusive server-side cause. The report's categorical statements that no login-code defect can cause the symptom are too strong: client state or timing can influence server responses. Codex does not adopt those absolutes. Its reference to unspecified open-source identity clients was not researched here and is not used as evidence. A proposed ten-minute cooling interval is a conservative experiment suggestion, not an Apple requirement. Standard HTTP registration was independently checked: [IANA lists 512–599 as unassigned](https://www.iana.org/assignments/http-status-codes/), so 541 alone does not identify a particular Apple/WAF/account condition.

Useful recommendations are to expose distinct submission/handoff/timeout states, preserve a stalled diagnostic tab, avoid automatic password retries, and compare an ordinary normal-browser login with a programme login only when the site can complete a login. A one-submission-per-arming proposal needs adaptation to the legitimate account-preflight and checkout flows, and must not create redundant user prompts. None of these recommendations has been implemented merely because it was returned. The earlier unknown final remains unchanged.

## Verbatim model response

All eight in-scope files are read in full. Here is the diagnosis.

The C258 run shows the programme's password submission worked and the failure sits in the store's sign-in handoff. Nothing in the login module can produce a server-error response from that merchant endpoint, so no login-code change will cure this symptom. The next step is a human, status-only, paired observation of an ordinary manual login before any further programme attempt. This is a diagnosis, not an acceptance of the application.

## Observation, meaning, and ranked causes

| Request | Host | Path | Status |
|---|---|---|---|
| Identity completion | idmsa.apple.com.cn | /appleauth/auth/signin/complete | 200 |
| Store handoff | secure11.www.apple.com.cn | /shop/signIn/idms/authx | 541 |

**What it establishes.** The widget accepted the synthetic submission and sent a real completion request, which the identity host answered with a success-class status. The browser then requested the store's handoff path and received a server-error-class status. The failure point is therefore after the identity step and on the merchant side. This is a different failure from the C257 label defect, which never produced a request. Both statuses are what the browser received; where along the path each was generated is not identified.

**What 541 means.** It is not defined in RFC 9110 and not registered with the Internet Assigned Numbers Authority. RFC 9110 section 15 tells clients to treat an unrecognised code by its class, so the only authoritative meaning is "server error". Any finer meaning belongs to whatever produced it. That could be the store application, a content delivery network, a web application firewall, or an intermediary. The capture identifies none of these, so no Apple-specific mapping and no risk-block claim is supported.

**What it does not establish.**
- **Session creation.** Whether an identity session was actually created, or whether the completion body carried a soft error. No bodies or headers exist.
- **Handoff mechanics.** Whether the handoff was a top-level navigation or a background request, its method, or its timing after the completion call.
- **Completeness.** Whether other requests occurred before or between the two listed ones. The capture was tab-scoped and may not be exhaustive.
- **Challenge state.** No challenge interface was observed, and the widget would normally render one rather than spin, but that is inference.
- **Oct 5 linkage.** Same endpoint and same status is a recurrence pattern, not proof of the same cause.

Context from outside this project, not verified here: open-source clients of the public identity widget treat a success status at the completion path as "password accepted, no further step". The .cn host and the current widget version were not checked, so this stays background only.

**Ranked causes.**

| Rank | Cause | Evidence for | Evidence against | Standing |
|---|---|---|---|---|
| 1 | Store handoff, session, or service failure | Error returned by the store endpoint after identity success; same endpoint and status on Oct 5; human saw the site failing right after; manual logins intermittently hang | None | Best supported; the sub-cause is unknown |
| 2 | Stale or invalid sign-in transaction state | Handoff state is created when the sign-in page loads; earlier interrupted logins in the same profile | No timing data; the programme submits on the first AUTH read after the widget is ready, so long idle time is not expected but was not measured | Speculative, testable |
| 3 | Extension or synthetic event effects | Submission had no keyboard, pointer, or user activation; the tab was created in the background and activated later | Identity accepted it; the extension holds no network-altering permission; the isolated world only touched the DOM; the handoff runs entirely outside the extension | Weak for this symptom; needs the paired observation to exclude |
| 4 | Account authentication or challenge | None | Success-class completion; no challenge interface; the parser would have reported manual | Unlikely for this run; a store-side account state problem is pure speculation |
| 5 | Network or edge differences | Intermittency reports only | No comparison data; same status on two different days | Speculative |

Evidence for rank 3 being weak: the extension declares only scripting, storage, activeTab, and optional native messaging and host grants at `web/checkout-connector/manifest.json:6`. It cannot modify requests, headers, or cookies.

## Login code review

No defect in the login module can cause a merchant server error. The defects below affect what the programme can see and report, which is why the run ended in an opaque bounded wait.

**Worth fixing now.**
- **Post-submission state collapses to waiting.** After one submission, the per-tab attempt key makes every later attempt return waiting at `web/checkout-connector/apple-login.js:76`. The status surface then cannot distinguish "form not ready", "submitted and handoff pending", and "handoff failed".
- **Submitted means clicked, not accepted.** The command returns submitted right after the click at `web/checkout-connector/apple-login.js:48`. No busy-state check follows, so the programme never confirms that the widget entered its spinner.
- **The parent page is never checked for errors during AUTH.** The order reader returns auth for any sign-in path before looking at alerts at `web/checkout-connector/order-audit.js:38`. A store error banner outside the widget stays invisible. Inside the widget only alert roles, dialogs, and challenge headings count at `web/checkout-connector/apple-login.js:23`. Live regions or plain error text are not detected.
- **Credentials stay armed after a submission.** The attempt key is per tab, not per arming. Any other owned tab that reads AUTH within the arming window triggers its own submission through `web/checkout-connector/checkout-rpc-peer.js:99`. The report records a single submitted action, so this did not happen, but it is not structurally guaranteed.
- **Re-arming within a session is silently dead.** The deadline is set once at `web/checkout-connector/apple-login.js:56` and never reset by clear, and the stopped flag is never reset either. After expiry or any stop, a new configure in the same session yields expired or disabled without explanation.
- **Three independent windows with no diagnosis at the end.** Each ends in a generic state, and the human sees a spinner the whole time.

| Window | Starts | Length | End state |
|---|---|---|---|
| Login arming | configureLogin | 300 s | expired, credentials cleared |
| Audit AUTH wait | first auth or loading read | 300 s | unknown, tab kept |
| Worker order watch | continueWhenReady | 300 s | blocked message |

**Hypotheses that need observation, not fixes.**
- **Linked-label resolution.** The name joins the text of referenced elements, including hidden descendants, and requires an exact match at `web/checkout-connector/apple-login.js:19`. The live run matched, so this is brittleness, not the cause.
- **Browser autofill.** The account field was prefilled on the live page and the mismatch check handled it. An empty configured password passes validation, skips the setter, and submits whatever autofill placed in the field. That path should be documented as deliberate or closed.
- **Same-task click.** Input and change events fire synchronously before the click at `web/checkout-connector/apple-login.js:46`. Common frameworks including React process these events synchronously, and the completion request shows the password reached the widget. A one-macrotask yield before the click is cheap hardening, not a cause.
- **Iframe or document changes.** A changed document id throws and stops safely. The final top-level path of the tab was not recorded, which leaves open whether the handoff navigated the page.
- **Asynchronous framework state.** The widget's own work after the click is invisible to the programme by design and cannot be a merchant-side cause.

The renderer test at `test/checkout-c258-login-label.test.ts:9` covers recognition and a single click only. It depends on a Codex runtime cache path, which ties it to one machine.

## Experiments, recovery, and next step

**Bounded experiment sequence.** Status, host, and path only. No bodies, headers, cookies, or tokens. One submission per step, and a cooling pause of at least ten minutes after any server error. Any host grant or challenge remains a separate human action.

1. **Site health first.** The human opens the order list address in a normal tab. Success signal: the ordinary sign-in page renders with the widget. Stop if the store itself shows an error page, because nothing programme-side can be learned then.
2. **Manual login, same profile, paired in time.** The human types credentials once with the network panel showing only the status column. Success signal: the handoff path returns a non-error status and the order list shows the heading and signed-in account line that the audit reader requires. A server error on the handoff confirms rank 1 or 5 for that moment and exonerates the programme; stop and wait. A challenge is completed by the human or the step stops.
3. **Programme attempt only after a manual success.** The human signs out normally, then arms the programme once. Success signal: the same two paths return success-class statuses and the audit reaches clear, unpaid-exists, or unconfirmed. If the programme fails minutes after a manual success, rank 3 becomes credible, and the next comparison is the secure host number and the final tab path, both public.
4. **Only if results diverge.** Compare the time between sign-in page load and submission from local timestamps to test rank 2. Compare the secure host number across runs to test rank 5.

**Recovery and interface changes.**
- **Add an explicit post-submission state.** Record the tab and time of the one submission, report a distinct pending state, and end with a distinct handoff-unconfirmed state after a shorter bound. Keep the tab, clear the password, and never resubmit.
- **Read public error signals after submission.** Inside the widget, treat a visible busy state as confirmation of submission. In the parent, check visible alerts and dialogs even on the sign-in path and return a public enum such as auth-error, never page text.
- **One submission per arming.** Require explicit human re-arming before any second submission anywhere, including other owned tabs, and make re-arming after expiry or a stop work or fail loudly.
- **Show elapsed time and the public step.** The desktop interface should display the step enum and its age so the human sees progress stop rather than an endless spinner.
- **Preserve the tab by default.** The kept tab is the only evidence of what the store displayed, and an identity session may already exist. One human-approved normal refresh of the same tab is reasonable when the bound ended with the spinner still visible, no challenge was shown, and the status diagnostic showed a server error on the handoff. If the refresh shows the order list, continue. If it shows the form again, do not auto-submit.
- **Fresh official entry.** Reasonable when the tab landed on an unrecognised error address, when the human closed the tab, or when a refresh re-shows the form and a clean transaction is wanted. A fresh entry must start unarmed.

**What Codex should do now.** Do not change the login form logic for this symptom and do not add retries. The store handoff was unavailable at the time of the C258 run, and whether it works now is unknown until the human's paired observation. Hand the four-step checklist to the human with a status-only recording template. In parallel, implement the post-submission state, one-submission-per-arming, and public error enums with unit and renderer tests, since none of that depends on Apple availability. Report plainly that automatic form submission is verified, completed login is not, and unpaid-order creation is not. The prior unverified final submission still has to be reconciled through the order list before any new purchase. If a manual login succeeds while the site is healthy, the programme's audit path proceeds without the form login, which is the fastest route to the one unpaid order.

**Read coverage and unavailable evidence.** I read all eight listed files in full and nothing else. I ran no commands, used no browser or network, invoked no agents, and modified no file. I did not read the page program, auth continuation, or checkout runtime modules, so the final AUTH phase and the worker's polling cadence are inferred from the peer and worker code only. Unavailable: request methods and initiators, timing between completion and handoff, any requests outside the two listed, the final top-level tab path, what the parent page displayed, how many login attempts ran after the submission, the secure host used by earlier manual successes, and the Oct 5 response body.
