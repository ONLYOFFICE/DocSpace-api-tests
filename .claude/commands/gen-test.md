# Generate API tests for an SDK method

Input: `$ARGUMENTS` — an SDK method written as `section.methodName`
(e.g. `rooms.createRoom`, `files.deleteFile`, `profiles.addMember`).

Generate **functional tests** and **permission tests** for it, following the conventions in CLAUDE.md.

## Steps

### 1. Resolve the section

`section` is a client accessor returned by `forRole(...)` (e.g. `rooms`, `files`, `security`).
If only a method name was given, grep `src/services/api-sdk.ts` for it to find the owning
`<accessor>: new XxxApi(...)` line. If several clients expose the method, ask the user which one.

### 2. Research (do these in parallel)

- In `src/services/api-sdk.ts`, find `<section>: new XxxApi(...)` inside `forRole()` to get the SDK class.
- Read that class in `node_modules/@onlyoffice/docspace-api-sdk/dist/api/` to get the method's
  parameters and return type, and to confirm it exists — if it doesn't, stop and tell the user.
  Note the exact request shape: params are usually wrapped in a named object,
  e.g. `createRoom({ createRoomRequestDto: {...} })`.
- Find the HTTP method and path for the endpoint (look for `localVarPath` in the class source).
- Read the existing `{section}.spec.ts` and `{section}.permissions.spec.ts` under `src/tests/` and
  copy their imports, `test.describe` layout, and style exactly.

### 3. Functional test → `{section}.spec.ts`

- Imports: `import { expect } from "@playwright/test";` and `import { test } from "@/src/fixtures/index";`
- Nest the test under the file's existing `describe` layout — outer `test.describe("API {section} methods")`,
  inner `test.describe("{HTTP} {path}")` — matching what the file already does.
- Test name: `"{HTTP_METHOD} {path} - {description}"`.
- Use `apiSdk.forRole("owner")` for the action; create any prerequisite entity (room/file/folder) in setup.
- Assert both `status` and the response data.
- Use `test.step()` for multi-step flows and async helpers (`waitForOperation`, `apiSdk.archiveRoom()`, …) where needed.

### 4. Permission tests → `{section}.permissions.spec.ts`

- One `test()` per role: authorized roles → status 200, unauthorized roles → status 403.
- Cover at least: owner, docSpaceAdmin, user, guest.

### 5. Verify

Run `npm run tsc` and fix any type errors.

## Rules

- Read the existing spec file first; never create a new file if one already exists for the section.
- Use exact SDK parameter types — don't guess. Use `apiSdk.faker` for random test data.
- When in doubt, follow the patterns already in the file over anything written here.
