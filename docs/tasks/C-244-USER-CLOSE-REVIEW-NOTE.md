# Exact M2 acceptance

The C243 reproduction is now run rather than only traced. The combined production Worker/AuthContinuation -> Runtime.orderAudit -> NativeCheckoutApi -> CheckoutRpcPeer -> OrderAudit uses a fake Chrome onRemoved event between two polls. Old candidate created a second tab (actual2 versus expected1). Repaired code creates no tab and makes no focus call, stops the watcher, sends no second final, and allows one later explicit readonly query. A separate event test proves our own successful query cleanup does not create the user-close marker. No old assertions were weakened.

The automatic flag changes readonly observation behaviour only. It is boolean-validated at both named API ends, supplied by Runtime.orderAudit for automatic observation, and not a purchase grant. No permission or host expansion, journal rewrite, customer data output, new recovery authority or merchant mutation.
