# C096 confirmed-transfer availability (Codex implementation)

R06/R08/R10, prior C091 N10a. A local cart ownership transfer may already be atomically saved, then fail before the first purchasing job state. The GUI can retain the imported readonly flag and disable continuation. This is an availability defect, not proof of a merchant failure.

Root appended a reproduction against C093: transfer write succeeds, a deliberately failing first step issues no merchant command, but no nonreadonly progress is emitted; the assertion fails. The runtime now publishes a fixed nonreadonly BAG/NEEDS_USER progress only after successful local creation, while still holding its owner and not closing. An earlier failure or pause does not gain this signal. It changes no stored authority, approval, purchase plan, unknown/finality rule or original source revocation.

The new test passes; full Node1443 and Python16 pass as Codex self-verification. Merchant APIs/plans are FAKE; no actual order, account or production handoff. C094's real provider session quota has interrupted review of the C093 physical-owner work; no agreement was returned. The combined new bytes must be reviewed under the current C096 manifest and original terminal C094 session after its reported11:40 Asia/Shanghai reset, not approved using the old C093 SHA.
