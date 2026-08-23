Document 24 — Non-Functional Requirements

Doggy Style — Quality Attributes


## 1. Performance

- Primary screens should render useful content quickly on normal mobile connections.

- Matching responses should be optimized through appropriate indexes, pagination, caching and precomputation where necessary.

- Message sending should provide immediate client feedback while server delivery is confirmed asynchronously where appropriate.


## 2. Responsiveness

- Product is mobile-first and must work on common phone widths before desktop optimization.

- Touch interactions must remain usable without relying on hover.


## 3. Accessibility

- Use semantic controls, keyboard support where applicable, readable contrast, visible focus, descriptive labels and non-color-only status indicators.

- Images require appropriate alternative text or decorative treatment.


## 4. Reliability

- Critical state changes must be transactional and idempotent where appropriate.

- Temporary external-service failures should not corrupt domain state.


## 5. Scalability

- Candidate discovery, messaging, notifications and image delivery should be independently scalable.

- Database queries must be indexed and paginated.


## 6. Observability

- Log structured application events without exposing private message contents unnecessarily.

- Monitor API errors, latency, queue failures, database health and external-service failures.


## 7. Data Protection

- Minimize collected data, protect private data, restrict access by owner/role, and separate public profile information from private account/verification data.
