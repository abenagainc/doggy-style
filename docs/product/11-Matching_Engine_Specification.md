# Document 11 — Matching Engine Specification

Doggy Style — Product Architecture | Draft v0.2

- Pipeline: Candidate Pool → Eligibility → Hard Filters → Preference Evaluation → Ranking → Candidate Feed.

- Eligibility: owner/account satisfies platform requirements; dog is eligible, available, breeding-enabled and sufficiently complete.

- Preferences: Required excludes; Preferred boosts ranking; Don't Care has no effect.

- Ranking uses distance, preference alignment, verification level, profile completeness and approved product signals.

- Distance is displayed, filterable and used in ranking.

- Verification level affects ranking.

- Normal and Strong Interest are distinct signals; Strong Interest is visible to the recipient and has stronger significance.

- Every candidate receives Pass, Interested or Strong Interest; passed dogs can later be reviewed.

- After pool exhaustion, offer Review Passed Dogs and Edit Preferences.

- Passed candidates may reappear after a configurable cooldown; duration remains a business configuration.

- Interest creation checks for reciprocal interest before creating a Connection.

- Future rollouts configure entity types, participant types, eligibility, preference dimensions, ranking, relationship states and transaction behavior.
