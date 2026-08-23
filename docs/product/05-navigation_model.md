Document 05 — Navigation Model

Doggy Style — Navigation Architecture


## 1. Navigation Philosophy

- The navigation should reinforce the mental model: 'I am an owner managing a dog.'

- The dominant context is Active Dog → Activity rather than Owner → Activity → Dog.


## 2. Primary Navigation

- Discover.

- Connections.

- Messages.

- More.


## 3. Active Dog Switcher

- The dog switcher is globally accessible and allows the owner to change the active dog with minimal interaction.

- Switching dogs changes the dog-specific context of Discover, Connections, and Messages.


## 4. Discover

- Discover → Candidate → Dog Profile → Pass or Interested.

- After an action, the user can continue discovering without unnecessary navigation.


## 5. Connections

- Connections → Active/Closed → Connection Detail → Conversation.

- Connections remain dog-centric and identify both dogs and relevant owners.


## 6. Messages

- Messages contains conversations grouped by the Active Dog.

- Conversation context should clearly identify which dogs the conversation concerns.


## 7. More

- My Dogs, Account, Settings, Verification, Safety, and Help live in secondary navigation.


## 8. Onboarding Navigation

- Landing → Sign Up → Verification → Owner Setup → Create First Dog → Dog Profile Setup → Breeding Setup → Profile Completion → Discover.


## 9. Returning User

- Login → Restore Last Active Dog → Main App.

- If the last dog is unavailable or archived, the user selects another dog.


## 10. Navigation Rule

- Every dog-specific experience must be scoped to an Active Dog. Every owner-level experience must be scoped to the Owner Account.
