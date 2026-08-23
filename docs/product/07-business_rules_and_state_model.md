Document 07 — Business Rules & State Model

Doggy Style — Matching & Relationship Lifecycle


## 1. Core Objects

- Owner → manages Dog → participates in Interest → can create Connection → contains Conversation → can result in Decision.


## 2. Owner Lifecycle

- Created → Unverified → Verified → Active → Suspended.


## 3. Dog Lifecycle

- Created → Incomplete → Complete → Available → Unavailable → Archived.


## 4. Dog Eligibility

- A dog is eligible for discovery when the owner is verified, the profile is complete, breeding is enabled, and platform eligibility rules are satisfied.


## 5. Interest

- Interest is directional: Dog A → Dog B.

- There should be only one active directional interest between the same two dogs at a time.

- Interest states: None → Active → Withdrawn / Declined / Mutual.


## 6. Mutual Interest

- A Connection is created when A → B and B → A.

- Mutual interest is not the same as agreement.


## 7. Connection

- A connection is the relationship container between the two owners around their two matching dogs.

- For MVP: Active → Screening → Proceeding or Closed.


## 8. Conversation

- A conversation belongs to a connection, not directly to an owner or dog.

- Messages remain associated with the dog pair and owner pair that created the connection.


## 9. Decision / Proceeding

- Proceeding requires explicit confirmation from both owners.

- If either owner stops, the connection can close.


## 10. Multiple Connections

- A dog may have multiple active interests and multiple active connections simultaneously.


## 11. Availability

- Changing a dog to Unavailable removes it from new discovery but does not automatically erase existing historical connections.


## 12. Re-Interest

- For MVP, after an interest is declined, the same dog should not immediately be able to express interest again. A future cooldown/re-interest policy can be added later.


## 13. Blocking

- Blocking operates at the owner level and prevents future interaction across that owner's dogs according to platform safety rules.


## 14. Reporting

- Reporting is distinct from blocking and routes the issue into moderation.


## 15. Notifications

- Notifications must identify the relevant dog, e.g. 'Max: Luna's owner accepted your interest.'


## 16. Matching Engine

- Candidate Pool → Eligibility → Hard Filters → Ranking → Candidate Feed.

- Hard filters should be represented as platform/business rules rather than hidden frontend assumptions.

- Preferences can conceptually be Required, Preferred, or Ignored.


## 17. Implementation Principle

- The frontend should not treat a click on Interest as equivalent to creating a Match. The system creates directional interest, checks reciprocal interest, creates a connection if reciprocal, then enables the conversation and notifications.
