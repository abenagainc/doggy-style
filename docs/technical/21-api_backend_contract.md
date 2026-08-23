Document 21 — API / Backend Contract

Doggy Style — API Contract Baseline


## 1. API Principles

- APIs are versioned and authenticated where required.

- Request validation and authorization happen server-side.

- Responses use consistent success/error envelopes.

- IDs are opaque and stable.

- Clients must not infer business state from HTTP status alone.


## 2. Authentication

- POST /api/v1/auth/signup

- POST /api/v1/auth/login

- POST /api/v1/auth/logout

- POST /api/v1/auth/password-reset

- POST /api/v1/auth/verify


## 3. Dogs

- GET /api/v1/dogs

- POST /api/v1/dogs

- GET /api/v1/dogs/{dogId}

- PATCH /api/v1/dogs/{dogId}

- POST /api/v1/dogs/{dogId}/photos

- PATCH /api/v1/dogs/{dogId}/availability

- PATCH /api/v1/dogs/{dogId}/preferences

- POST /api/v1/dogs/{dogId}/archive


## 4. Matching

- GET /api/v1/matching/candidates?dogId=...

- POST /api/v1/matching/refresh

- The response includes candidate identity, profile summary, distance, verification signals, compatibility signals, and candidate token/id.


## 5. Interests

- POST /api/v1/interests

- GET /api/v1/interests/sent

- GET /api/v1/interests/received

- POST /api/v1/interests/{interestId}/withdraw


## 6. Connections

- GET /api/v1/connections

- GET /api/v1/connections/{connectionId}

- POST /api/v1/connections/{connectionId}/proceed

- POST /api/v1/connections/{connectionId}/end


## 7. Messaging

- GET /api/v1/conversations

- GET /api/v1/conversations/{conversationId}

- GET /api/v1/conversations/{conversationId}/messages

- POST /api/v1/conversations/{conversationId}/messages


## 8. Verification / Safety

- GET /api/v1/verifications

- POST /api/v1/verifications

- POST /api/v1/reports

- POST /api/v1/blocks

- DELETE /api/v1/blocks/{ownerId}


## 9. Notifications

- GET /api/v1/notifications

- POST /api/v1/notifications/{notificationId}/read


## 10. API Errors

- Use stable application error codes such as VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, UNAVAILABLE, INTERNAL_ERROR.

- Errors should be safe for display and must not leak sensitive implementation details.
