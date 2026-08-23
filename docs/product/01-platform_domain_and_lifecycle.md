Document 01 — Platform Domain & Lifecycle

Doggy Style — Reusable Matching Engine


## 1. Platform Concept

- The product is a reusable matching engine for applications where people ultimately form relationships, while the object being matched can vary.

- The first rollout is dog breeding: Dog ↔ Dog, operated by Owner ↔ Owner.

- Future examples include adoption: Adopter ↔ Rescue/Kennel with Person ↔ Dog matching, owner dating: Owner ↔ Owner with dogs as part of the context, and auctions: Bidder ↔ Seller with Buyer ↔ Product matching and bidding before the final relationship.


## 2. Core Separation

- Owner — the human account and decision-maker.

- Dog — the primary matching entity in the initial breeding application.

- Interest — a directional expression of intent.

- Connection — the relationship created after reciprocal interest.

- Conversation — the communication layer attached to a connection.

- Decision/Agreement — the final outcome after screening in conversation.


## 3. Core Lifecycle

- Owner account → Dog profile → Discovery → Interest → Mutual Interest → Connection → Conversation/Screening → Decision → Proceeding or Closed.


## 4. Reusable Engine Principle

- The matching engine should separate matching entities, participating people, interest, relationship, conversation, and final transaction/decision so the same underlying architecture can support different product rollouts.
