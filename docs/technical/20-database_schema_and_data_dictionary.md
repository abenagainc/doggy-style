Document 20 — Database Schema & Data Dictionary

Doggy Style — Logical Database Design


## 1. Core Tables

- owners — human accounts and account-level settings.

- dogs — primary matching entities.

- dog_photos — dog image metadata and storage references.

- dog_health — health information.

- dog_vaccinations — vaccination records.

- dog_pedigree — pedigree information.

- dog_temperament — temperament attributes.

- dog_breeding_profiles — breeding-specific information.

- dog_preferences — matching preferences.

- dog_availability — availability state and schedule/configuration.

- interests — directional dog-to-dog interests.

- connections — reciprocal-interest relationships.

- conversations — communication containers.

- messages — conversation messages.

- verifications — verification records.

- notifications — owner notifications.

- blocks — owner-level blocks.

- reports — moderation reports.

- analytics_events — product event records.


## 2. Owner Fields

- owner_id, contact information, display information, account status, verification status, created_at, updated_at.

- Authentication credentials/tokens should be handled by the chosen authentication mechanism rather than stored as raw passwords in the application database.


## 3. Dog Fields

- dog_id, owner_id, name, sex, date_of_birth, breed, location, profile_status, availability_status, breeding_enabled, created_at, updated_at, archived_at.

- Initial creation requires name, sex, date of birth/age, and breed.


## 4. Preference Fields

- dog_id, preference_dimension, preference_value, preference_mode.

- preference_mode supports REQUIRED, PREFERRED, DON'T_CARE.


## 5. Interest Fields

- interest_id, source_dog_id, target_dog_id, strength, status, created_at, updated_at, withdrawn_at, declined_at.

- Strength supports NORMAL and STRONG.


## 6. Connection Fields

- connection_id, dog_a_id, dog_b_id, owner_a_id, owner_b_id, status, created_at, updated_at, proceeded_at, closed_at.


## 7. Conversation & Message Fields

- conversation_id, connection_id, status, created_at, updated_at.

- message_id, conversation_id, sender_owner_id, message_type, body, sent_at, delivered_at, read_at, failed_at.


## 8. Verification Fields

- verification_id, subject_type, subject_id, verification_type, status, evidence_reference, submitted_at, reviewed_at, expires_at, reviewer_id.


## 9. Integrity Rules

- A dog has one owner in MVP.

- Co-ownership is not represented as an active MVP relationship.

- Interest source and target dogs cannot be identical.

- Connection creation requires reciprocal active interests.

- Blocking is owner-level.

- Foreign keys and unique constraints should prevent duplicate active relationships.


## 10. Indexing

- Index dog discovery eligibility and location fields.

- Index interests by source/target dog and status.

- Index connections by owner/dog and status.

- Index messages by conversation and sent_at.

- Index notifications by owner and read state.
