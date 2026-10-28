# Update the tests to a new DocSpace API SDK

Input: `$ARGUMENTS` — optional. A git ref with the previous SDK (default `origin/master`),
or a note from the user about what to focus on.

Use this on a branch where the SDK was already updated — normally the `chore/sdk-<sha>` branch
of a PR opened by the nightly bot. Goal: list what changed in the SDK, make the tests compile again,
and separate mechanical fixes from changes that may be server bugs. The user decides on the disputed ones.

## How the SDK update works

- The SDK the tests need is the one pinned by the server: the `sdk/docspace-api-sdk-typescript`
  submodule in `DocSpace-server@<branch IO is built from>`. The package itself is the
  `onlyoffice-docspace-api-sdk-*.tgz` committed in that SDK commit.
- `sdk.json` keeps the source: `serverBranch` (`"auto"` = take the branch from the IO version:
  `4.0.1.12172` → `hotfix/v4.0.1` / `release/v4.0.1`, `develop.N` → `develop`), `ioUrl`,
  and `commit` — the SDK commit installed now.
- `npm run sdk:update` (`scripts/update-sdk.sh`) installs the pinned SDK and writes `commit`;
  `npm run sdk:update -- --check` only reports whether the SDK is up to date.
- Every night, after the API tests, the `sdk-update` job in the `autotests` repo runs the same script.
  If the pin moved, it opens a PR `chore/sdk-<sha>` here with the new tgz, `sdk.json`, the SDK commits
  and the `tsc` errors, and posts to the Telegram chat of the prod hourly check.
  If the SDK is current it posts `✅ SDK up to date`; on failure `⚠️ SDK check failed`.
- A PR marked `[ROLLBACK, do not merge?]` means IO is on a branch (usually `develop`) whose SDK is
  older than ours. Do not fix tests for it — tell the user and stop.
- The bot does not open a PR again while its branch exists: closing a PR and keeping the branch silences
  that SDK version, deleting the branch makes the bot propose it again.

## Steps

### 1. Context

- Check the branch: `git branch --show-current`. The base is `$ARGUMENTS` if it is a git ref,
  otherwise `origin/master` (run `git fetch origin master` first).
- If the SDK tgz in the working tree is the same as in the base (`git diff --quiet <base> -- 'onlyoffice-docspace-api-sdk-*.tgz'`),
  tell the user there is nothing to update and stop.
- Run `npm ci` so `node_modules` has the new SDK from the tgz — otherwise `tsc` checks the old one.
- Read `git diff <base> -- sdk.json` to get the old and new SDK commits.

### 2. What changed in the SDK

Compare the compiled packages: the new one is `node_modules/@onlyoffice/docspace-api-sdk/dist`,
the old one is the tgz from the base, unpacked to a temp dir:

```bash
OLD_TGZ=$(git ls-tree --name-only <base> | grep -E '^onlyoffice-docspace-api-sdk-.*\.tgz$')
mkdir -p /tmp/sdk-old && git show "<base>:$OLD_TGZ" | tar xz -C /tmp/sdk-old   # → /tmp/sdk-old/package/dist
```

Where to look in `dist` (skip `dist/esm`, it duplicates the same code):
- **Methods**: `api/**/*-api.d.ts`, the `export declare class XxxApi extends BaseAPI { ... }` block —
  each method is a line `    methodName(requestParameters…)`, with its `@summary` in the JSDoc above.
- **Request parameters**: in the same file, `export interface XxxApiMethodNameRequest { readonly name?: Type; }`.
- **HTTP method and path**: in the matching `.js`, `methodName: (...) => __awaiter(...)` followed by
  ``const localVarPath = `/api/2.0/...` `` and `method: 'POST'` (the first occurrence in the file).
- **Models**: `models/*.d.ts`, `export interface Name { field?: Type; }` (also `export declare const` / enums).

Collect:
- renamed methods — a method gone and a new one in the same class with the same HTTP method and path;
- new methods and removed methods;
- changed request parameters (a parameter renamed, added, removed or retyped) and changed routes;
- new and removed models, and added / removed / retyped fields of the models the tests use.

Compare with a script in the temp dir or with `diff`/`grep` — do not eyeball hundreds of files.

**Always show the user the list of new methods** (`Api.method — HTTP path — summary`), grouped by API
class, and mark which of them already have tests (grep the method name in `src/`). Those without tests
are candidates for `/gen-test`.

### 3. Type errors

Run `npm run tsc` and group the errors by cause, using the diff from step 2:

| Kind | Typical error | Fix |
|---|---|---|
| Renamed request parameter (`backupDto` → `startBackupRequestDto`) | TS2353 / TS2561 "does not exist in type …Request" | Rename in the test, same value |
| Renamed method (`aiAiSend` → `aiSend`, same route) | TS2339 "Property … does not exist" | Rename the call |
| Renamed model / type (`BackupProgress` → `BackupProgressDto`) | TS2305 / TS2724 "has no exported member" | Rename the import and usages if the fields are the same |
| Removed method, removed model field, changed field type, new required parameter, changed enum value, changed route | anything | **Not mechanical — go to step 4** |

Fix the mechanical group first, in helpers (`src/helpers`, `src/services`) before specs, then re-run `tsc`.

### 4. Bug or intended change

For every non-mechanical change decide whether the server changed on purpose or broke something:

- Look for the reason: SDK commit messages (`git log` of the SDK range from step 1, also listed in
  the PR description), the summary/description of the method in the new SDK
  (`node_modules/@onlyoffice/docspace-api-sdk/dist/api/...`), and, if the server repo is available
  locally, the controller and its recent commits on `serverBranch`.
- **Intended** (documented rename or redesign, deprecated endpoint removed, stricter validation that the
  commit message describes): adapt the test to the new contract and say so in the report.
- **Looks like a bug** (field or endpoint disappeared without explanation, response type got weaker,
  a required parameter appeared for no reason, an expected status code changed): do not adapt the test
  to the new behaviour. Collect it as a disputed item.
- **Not sure**: also a disputed item.

### 5. Disputed items — ask, do not guess

Show the user all disputed items at once. For each: the SDK change, the affected tests, what you found
about the reason, and the options:

1. adapt the test — the change is intended;
2. keep the test and mark it as a known bug: `test.fail("BUG <number>: <description>")` — ask for the bug number;
3. leave it for later.

Wait for the answers before touching these tests.

### 6. Verify

- `npm run tsc` and `npm run lint` must pass.
- Offer to run the affected spec files against IO (`npx playwright test <file>`); it needs `.env`.
  Do not run the whole suite unless asked.

### 7. Report

Finish with:
- new methods in the SDK, with or without tests;
- mechanical fixes (counts per kind, files);
- changes adapted as intended, with the reason;
- tests marked with `test.fail` and their bug numbers;
- open questions.

## Rules

- Never silence type errors: no `as any`, `@ts-ignore`, `@ts-expect-error`, no `?.` added just to compile.
- Never delete a test, weaken an assertion or change an expected status code without the user's decision.
- Prefer fixing shared helpers over editing many specs.
- Do not run `npm run sdk:update` here — the bot already installed the SDK on this branch.
- Do not commit or push unless the user asks.
