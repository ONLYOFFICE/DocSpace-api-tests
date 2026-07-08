// sendOwnerChangeInstructions POST /api/2.0/settings/owner cannot be fully automated
// because the portal owner's email must be activated before the request is processed.
// In the test environment, portals are created without email activation (no mail server).
// The API returns 400 "Owner's email is not activated" in this case.
//
// Roles with access: Owner, DocSpaceAdmin (both get 400 due to email not being activated).
// Roles without access: RoomAdmin, User, Guest (403) — covered in owner.permissions.spec.ts.
//
// To cover the positive scenario, a mail server integration is required to:
//   1. Activate the owner's email after portal creation.
//   2. Receive and confirm the ownership transfer email.
//
// updatePortalOwner PUT /api/2.0/settings/owner is the confirmation step — it completes
// the ownership transfer using a token from the confirmation email. Cannot be automated
// for the same reason: requires a mail server to obtain the confirmation token.
