# Document 10 — Data / Entity Model

Doggy Style — Product Architecture | Draft v0.2

- Owner: human account, identity, contact, account status, verification, security and notification settings.

- Dog: primary matching entity; one owner in MVP; profile, health, vaccination, pedigree, temperament, breeding, availability, verification and matching preferences.

- Interest: directional Dog A → Dog B; normal or strong; lifecycle status and timestamps; one active directional interest per pair.

- Connection: created by reciprocal interest; references both dogs and owners and contains lifecycle state.

- Conversation: belongs to a Connection and contains Messages.

- Message: sender, content, timestamps, delivery/read state and optional shared dog profile.

- Verification: owner/dog/health/pedigree verification with type, status, evidence and timestamps.

- Matching Preference: Required / Preferred / Don't Care.

- Notification: owner-level event with relevant dog context.

- Block: owner-level safety relationship.

- Report: moderation event tied to relevant owner, dog, conversation or message.

- Platform abstraction: Participant, Matching Entity, Interest, Connection, Conversation, Decision/Agreement and optional Transaction.
