Document 28 — Analytics & Event Tracking

Doggy Style — Product Measurement Plan


## 1. Core Events

- account_created, account_verified, dog_created, dog_profile_completed, dog_activated, active_dog_switched.

- candidate_viewed, candidate_passed, interest_sent, strong_interest_sent, mutual_interest_created, connection_created.

- conversation_started, message_sent, proceeding_confirmed, connection_closed.

- verification_started, verification_approved, verification_rejected.

- report_submitted, block_created.


## 2. Event Properties

- Include event timestamp, owner identifier, relevant dog identifier where appropriate, session/context identifiers, and non-sensitive event properties.

- Do not put private message contents or verification evidence into analytics events.


## 3. Core Funnel

- Account → First Dog → Profile Completion → First Candidate → First Interest → First Connection → First Conversation → Proceeding.


## 4. Multi-Dog Metrics

- Track Active Dog switches, discovery activity by dog, connections by dog, and completion/engagement by dog.


## 5. Product Questions

- Where do owners abandon onboarding?

- How many candidates are reviewed before first interest?

- How often does Strong Interest convert to reciprocal interest?

- How often do Connections reach conversation and proceeding?

- Does verification improve engagement/conversion?
