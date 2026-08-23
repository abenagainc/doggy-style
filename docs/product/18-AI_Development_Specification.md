# Document 18 — AI Development Specification

Doggy Style — Product Architecture | Draft v0.2

- Goal: provide AI-assisted development with explicit product rules so implementation does not invent business logic or collapse domain concepts.

- Core domain: Owner manages Dog; Dog participates in Interest; reciprocal Interest creates Connection; Connection owns Conversation; Conversation can produce Decision/Proceeding.

- Frontend: dog-first; Active Dog is global context for dog-specific experiences.

- Backend must be authoritative for eligibility, interest creation, reciprocal matching, connection creation, permissions, blocking, verification and ranking.

- Reusable components: DogCard, DogProfile, DogSwitcher, InterestActionGroup, ConnectionCard, Conversation, VerificationBadge, PreferenceControl, LoadingState, EmptyState, ErrorState.

- Keep Owner, Dog, Interest, Connection, Conversation, Message, Verification and Notification state separate.

- Matching service accepts Active Dog and configured matching parameters and returns eligible ranked candidates.

- Build order: authentication → owner/dog model → dog creation → completion → Active Dog → discovery → interest → connection → conversation → verification → notifications → safety → polish.

- AI guardrails: do not invent business rules; do not merge Owner/Dog; do not equate Match with Agreement; do not show dog-specific screens without Active Dog; do not hard-code future product assumptions.

- Future platform supports configurable participant types, matching entities, intents, eligibility, ranking, relationship states and transaction/auction behavior.
