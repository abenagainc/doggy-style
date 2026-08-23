# Document 09 — Screen Specifications

Doggy Style — Product Architecture | Draft v0.2

- Each screen defines purpose, Active Dog context, entry points, content, actions, states, validation, permissions, and exits.

- Discover: candidate photo, identity, breed, sex, age, distance, verification, compatibility signals; actions Pass, Interested, Strong Interest, View Profile.

- Candidate Profile: detailed photos, health/vaccination, pedigree, temperament, breeding information, verification, distance and matching signals.

- Dog Switcher: all dogs, active indicator, add dog; switching refreshes every dog-scoped area.

- Interests: Sent and Received; show strength, status, dog and owner context.

- Mutual Interest: both dogs, reciprocal-interest confirmation, Start Conversation.

- Connection: both dogs/owners, status, verification, Open Conversation, Proceed, End, Report, Block.

- Conversation: free-form MVP chat; persistent dog-pair context; Share Dog Profile, Proceed, End, Report, Block.

- Proceeding: both owners must confirm; MVP records proceeding only.

- Verification: Owner, Dog, Health/Pedigree tiers with pending/approved/rejected/expired states.

- Profile completion: first four fields mandatory for initial creation—name, sex, age/date of birth, breed; remaining information progressively completed.

- Discovery exhaustion: Review Passed Dogs and Edit Preferences.
