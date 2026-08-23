Document 22 — Business Logic & State Machines

Doggy Style — Authoritative Lifecycle Rules


## 1. Dog Lifecycle

- CREATED → INCOMPLETE → COMPLETE → AVAILABLE.

- AVAILABLE → UNAVAILABLE.

- UNAVAILABLE → AVAILABLE.

- Any active dog can be ARCHIVED.

- Archived dogs cannot enter new discovery.


## 2. Interest Lifecycle

- NONE → NORMAL_INTEREST or STRONG_INTEREST.

- Active interest can be WITHDRAWN according to applicable rules.

- An incoming interest can be DECLINED.

- If reciprocal active interest exists, the relationship becomes MUTUAL and a Connection is created.


## 3. Connection Lifecycle

- CREATED/ACTIVE → SCREENING → PROCEEDING or CLOSED.

- Proceeding requires explicit confirmation from both owners.

- Either owner can end the connection subject to platform rules.

- Blocking can force interaction restrictions and may close or restrict the connection.


## 4. Conversation Lifecycle

- Conversation is created with the Connection.

- Conversation remains active while the Connection permits messaging.

- Closed/restricted connections may make the conversation read-only or inaccessible according to safety rules.


## 5. Verification Lifecycle

- NOT_STARTED → PENDING → APPROVED or REJECTED.

- APPROVED may become EXPIRED or NEEDS_UPDATE.

- Verification changes can affect ranking and eligibility.


## 6. Matching Rules

- Hard eligibility runs before preference ranking.

- Required preferences exclude.

- Preferred preferences add ranking value.

- Don't Care has no ranking effect.

- Verification, distance, completeness, and approved ranking signals influence ordering.


## 7. Transactional Rules

- Interest creation and reciprocal-interest detection should be atomic enough to prevent duplicate Connections.

- Proceeding confirmation should be idempotent.

- Blocking must prevent newly unauthorized interaction even if stale client state exists.
