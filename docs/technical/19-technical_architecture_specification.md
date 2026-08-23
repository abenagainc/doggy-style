Document 19 — Technical Architecture Specification

Doggy Style — Recommended Development Architecture


## 1. Architecture Goal

- Build the first Dog Breeding rollout on a modular architecture that can later support a configurable matching-platform/SaaS model.

- Keep frontend presentation, backend business logic, matching logic, persistence, messaging, verification, and operational tooling separated.


## 2. Recommended Baseline Stack

- Frontend: TypeScript-based responsive web application using React.

- Backend: TypeScript service/API layer.

- Database: PostgreSQL.

- Object storage: S3-compatible storage for dog photos and verification documents.

- Realtime messaging: WebSocket/realtime service backed by the application database.

- Background jobs: queue/worker pattern for notifications, matching refreshes, verification processing, and other asynchronous work.

- The exact hosting/provider can be selected during implementation without changing the domain architecture.


## 3. Logical Architecture

- Client → API → Application Services → Domain Rules → PostgreSQL/Object Storage/External Services.

- Business-critical rules must execute server-side.

- Frontend state is a representation of server state, not the source of truth.


## 4. Core Services

- Authentication and account service.

- Owner and dog service.

- Matching service.

- Interest/connection service.

- Conversation/messaging service.

- Notification service.

- Verification service.

- Moderation service.

- Analytics/event service.

- Administration service.


## 5. Frontend Architecture

- Use reusable domain-oriented components and screens.

- Use an explicit Active Dog context.

- Separate server state from local UI state.

- Represent loading, empty, error, unavailable, and success states explicitly.


## 6. Backend Architecture

- Expose versioned APIs.

- Validate input at the API boundary.

- Authorize every protected operation.

- Keep domain transitions in application/domain services rather than UI code.

- Use transactions for operations that change multiple related records.


## 7. Deployment Environments

- Development for active implementation.

- Staging for integrated QA.

- Production for real users.

- Environment-specific secrets and configuration must never be committed to source control.


## 8. Extensibility

- Dog breeding is the first configuration of the platform, not the architectural boundary.

- Participant, matching entity, intent, relationship, ranking, and transaction concepts should remain replaceable/configurable.
