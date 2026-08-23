Document 23 — User Stories & Acceptance Criteria

Doggy Style — Implementation Acceptance Tests


## 1. Account

- As an owner, I can create an account and authenticate so I can manage my dogs.

- Acceptance: valid signup creates an owner; invalid input is rejected; verification state is recorded.


## 2. Create Dog

- As an owner, I can create a dog using the four mandatory fields.

- Acceptance: name, sex, age/date of birth and breed are validated; successful creation creates a dog owned by the current owner.


## 3. Complete Dog Profile

- As an owner, I can progressively complete the dog profile.

- Acceptance: incomplete optional sections are tracked; profile completeness is visible; completion does not overwrite existing data unexpectedly.


## 4. Active Dog

- As an owner with multiple dogs, I can switch the Active Dog.

- Acceptance: switching changes Discover, Interests, Connections and Messages to the selected dog's context.


## 5. Discover

- As an owner, I can review candidates for my Active Dog.

- Acceptance: candidates satisfy hard eligibility; card shows required summary data; actions are available.


## 6. Interest

- As an owner, I can send Normal or Strong Interest.

- Acceptance: an Interest is created with correct strength; duplicate active interest is prevented; notification is generated.


## 7. Mutual Interest

- As an owner, I can receive a Connection when interest is reciprocal.

- Acceptance: reciprocal interest creates exactly one active Connection and enables Conversation.


## 8. Chat

- As connected owners, I can exchange free-form messages.

- Acceptance: authorized participants can send/receive messages; unauthorized owners cannot access the conversation.


## 9. Proceeding

- As connected owners, we can confirm proceeding.

- Acceptance: one confirmation does not complete proceeding; both confirmations transition the Connection to PROCEEDING.


## 10. Passed Candidates

- As an owner, I can review passed dogs after the candidate pool is exhausted.

- Acceptance: the system offers Review Passed Dogs and Edit Preferences.


## 11. Safety

- As an owner, I can report or block another owner.

- Acceptance: report creates a moderation record; block prevents future interaction according to platform rules.


## 12. Verification

- As an owner, I can see verification state and submit verification.

- Acceptance: verification follows the defined lifecycle and affects eligible/ranking behavior as configured.
