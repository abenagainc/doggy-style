Document 29 — QA & Test Plan

Doggy Style — Release Quality Plan


## 1. Unit Testing

- Test state transitions, preference evaluation, eligibility, ranking calculations, interest reciprocity, permission rules, notification routing and validation.


## 2. Integration Testing

- Test API + database transactions, authentication, image upload, notifications, messaging persistence, verification records and moderation workflows.


## 3. End-to-End Golden Path

- Sign up → verify → create dog → complete profile → discover → view candidate → Strong Interest → reciprocal interest → Connection → chat → both proceed → Proceeding.


## 4. Multi-Dog Tests

- Create multiple dogs → switch Active Dog → verify Discover, Interests, Connections and Messages all use the selected dog.

- Notification for Dog B opened while Dog A is active must switch context correctly.


## 5. Negative Tests

- Interest without eligibility; duplicate interest; self-interest; unauthorized connection access; blocked owner interaction; expired session; failed message; unavailable candidate; incomplete dog.


## 6. Acceptance Testing

- Every P0 user story must have executable acceptance tests.

- Wireframes and requirements should be checked against implemented behavior before release.


## 7. Regression

- Any change to matching, permissions, connection state, or Active Dog context triggers regression tests across all affected flows.
