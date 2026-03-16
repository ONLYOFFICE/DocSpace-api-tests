# DocSpace API Tests

API-only test suite for [ONLYOFFICE DocSpace](https://www.onlyoffice.com/docspace) using `@onlyoffice/docspace-api-sdk` and Playwright as the test runner.

## Prerequisites

- Node.js 18+
- npm

## Setup

1. Clone the repository:
```bash
git clone https://git.onlyoffice.com/ONLYOFFICE/DocSpace-api-tests.git
cd Docspace-api-tests
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from the example:
```bash
cp .env.example .env
```

4. Fill in the environment variables:
```
PORTAL_REGISTRATION_URL=https://onlyoffice.io/apisystem/portal
DOCSPACE_OWNER_EMAIL=your-email@example.com
DOCSPACE_OWNER_PASSWORD=your-password
```

See `.env.example` for the full list of variables.

## Running Against a Local Build

Set `LOCAL_PORTAL_DOMAIN` to your local DocSpace instance (e.g. `localhost` or `192.168.1.1`):

```
LOCAL_PORTAL_DOMAIN=localhost
```

When set:
- Tests run against the local instance
- Tests expecting 402 (no paid plan) are skipped — local builds don't enforce payments, so these tests would always fail
- `MACHINEKEY` and `PKEY` are not required — payment activation is a no-op on local

## Running Tests

```bash
# Run all tests
npm test

# Run API tests only
npm run test:api

# Run a specific test file
npx playwright test src/tests/people/userType/userType.spec.ts
```

## Code Quality

```bash
# Type checking
npm run tsc

# Linting
npm run lint

# Lint with auto-fix
npm run lint:fix
```

Pre-push hooks (via Lefthook) automatically run `tsc` and `lint` checks.

## Test Organization

Each API area has up to two spec files:
- `*.spec.ts` — functional tests
- `*.permissions.spec.ts` — permission/authorization tests

## Known Bugs

Tests for known bugs are marked with `test.fail`:

```ts
test.fail("BUG 80474: DocSpace admin should not be able to promote User to DocSpace admin", async ({ apiSdk }) => {
  // test body runs and is expected to fail
});
```

- The test runs and fails as expected while the bug is open — shown as **passed** in the report
- When the bug is fixed, the test passes unexpectedly — shown as **failed** with "unexpected pass"
- That's the signal to remove `test.fail` and keep the test as a regular passing test

To check the status of a specific bug:
```bash
npx playwright test --grep "BUG 80474"
```

## Architecture

- Each test run creates a fresh portal and deletes it after completion
- `ApiSDK` provides role-based API access (`owner`, `docSpaceAdmin`, `roomAdmin`, `user`, `guest`)
- `addMember()` / `addAuthenticatedMember()` create test users with auto-generated data via Faker
- Axios with a Playwright adapter is used under the hood for HTTP requests
- `validateStatus: () => true` — SDK never throws on HTTP errors, allowing assertion on any status code

## Tech Stack

- **Test Runner**: [Playwright](https://playwright.dev/)
- **API SDK**: `@onlyoffice/docspace-api-sdk`
- **HTTP Client**: Axios (with Playwright adapter)
- **Test Data**: @faker-js/faker
- **Language**: TypeScript 5.8
- **Linting**: ESLint + Prettier
- **Git Hooks**: Lefthook
