# Document 15 — Edge Cases & Exception Flows

Doggy Style — Product Architecture | Draft v0.2

- Dog creation: abandoned setup, missing mandatory fields, incomplete optional information, duplicate submission, network failure.

- Discovery: candidate becomes unavailable, candidate is blocked, reciprocal interest arrives offline, duplicate action, exhausted pool, no candidates.

- Interest: withdrawal, decline, reciprocal interest, strong interest, duplicate action, blocked interaction.

- Connection: one party ends, one blocks, dog becomes unavailable, owner becomes suspended, only one party confirms proceeding.

- Messaging: failed send, offline send, closed conversation while composing, notification opens a different dog context, restricted conversation.

- Verification: pending, approved, rejected, expired or changed while ranked.

- Account: session expiry, suspension, dog archived, unauthorized access.

- Every exception should be recoverable or clearly explained rather than a dead end.
