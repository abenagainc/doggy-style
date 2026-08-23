Document 25 — Security & Privacy Specification

Doggy Style — Security Baseline


## 1. Authentication

- Use a proven authentication mechanism rather than custom password handling where practical.

- Support email/phone verification and secure password recovery.

- Sessions/tokens must expire and be revocable.


## 2. Authorization

- Every protected API operation checks current identity and resource ownership/role.

- Never rely on frontend hiding to enforce permissions.


## 3. Sensitive Data

- Health, vaccination, pedigree evidence, identity verification documents, private messages and precise location should have restricted access.

- Public dog profiles expose only information intentionally configured as public.


## 4. Blocking

- Blocking is owner-level and must be enforced server-side across future interaction paths.


## 5. Reporting

- Reports should be accessible to moderators while protecting reporter information where appropriate.


## 6. Account Deletion

- Provide a documented account deletion/deactivation workflow.

- Define retention/deletion rules for messages, reports, verification evidence and analytics before production.


## 7. Secrets

- Secrets and provider credentials belong in environment/secret management, never source code.


## 8. Security Testing

- Include authorization tests, injection tests, rate-limit tests, file-upload validation, session tests and abuse scenarios in QA.
