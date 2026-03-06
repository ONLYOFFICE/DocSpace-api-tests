# DocSpace API Tests — Claude Instructions

## Project purpose
API test suite for ONLYOFFICE DocSpace. Tests cover REST API endpoints for rooms, files, folders, and people management.

## How to write a test

### 1. Find the right file
Tests are in `src/tests/` grouped by feature:
```
src/tests/
├── files/
├── folders/
├── rooms/
│   ├── rooms.spec.ts              # functional tests
│   └── rooms_permissions.spec.ts  # permission/role tests
└── people/
    ├── profiles/
    ├── userType/
    ├── userStatus/
    ├── password/
    └── quota/
```

Add tests to the relevant existing file. Create a new file only if the feature doesn't fit anywhere.

### 2. Test structure
Always use the custom `test` from fixtures — it handles portal creation/cleanup automatically:

```ts
import { test, expect } from "@/src/fixtures";

test("POST /files/rooms - Owner creates a Custom room", async ({ apiSdk }) => {
  const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
    title: "My Room",
    roomType: RoomType.CustomRoom,
  });

  expect(status).toBe(200);
  expect(data.response?.title).toBe("My Room");
});
```

### 3. Available roles
`apiSdk.forRole(role)` returns an authenticated API client. Roles:
- `"owner"` — portal owner
- `"docSpaceAdmin"` — DocSpace administrator
- `"roomAdmin"` — room administrator
- `"user"` — regular user
- `"guest"` — guest

### 4. Creating test users
```ts
// Create user and get their credentials
const { data: userData } = await apiSdk.addMember("owner", "User");

// Create user and get authenticated SDK client for them
const { member, sdk } = await apiSdk.addAuthenticatedMember("owner", "User");
// sdk.forRole("user").rooms.getRooms(...)
```

User types: `"DocSpaceAdmin"`, `"RoomAdmin"`, `"User"`, `"Guest"`

### 5. Available API clients
Each role client exposes:
- `.rooms` — room operations
- `.files` — file operations
- `.folders` — folder operations
- `.profiles` — user profile operations
- `.userStatus` — user status operations
- `.password` — password operations
- `.peopleQuota` — quota operations
- `.sharing` — sharing/security settings

### 6. Assertions
The SDK never throws on HTTP errors (`validateStatus: () => true`), so always assert status explicitly:

```ts
expect(status).toBe(200);          // success
expect(status).toBe(403);          // forbidden
expect(data.response?.id).toBeDefined();
expect(data.response?.title).toBe("Expected Title");
```

### 7. Async operations (rooms archive, delete, etc.)
Some API calls return an async operation. Use `waitForOperation`:

```ts
import { waitForOperation } from "@/src/helpers/wait-for-operation";

const { status } = await apiSdk.forRole("owner").rooms.archiveRoom(roomId, { deleteAfter: false });
const operation = await waitForOperation(apiSdk.forRole("owner").operations);
expect(operation.finished).toBe(true);
```

Or use the shorthand methods on apiSdk:
```ts
await apiSdk.archiveRoom("owner", roomId);
await apiSdk.unarchiveRoom("owner", roomId);
await apiSdk.deleteRoom("owner", roomId);
```

### 8. Random test data
Use the built-in faker:
```ts
const title = apiSdk.faker.title();
const user = apiSdk.faker.generateUser();
```

## Conventions
- Test name = HTTP method + path + description, e.g. `"POST /files/rooms - Owner creates a Custom room"`
- Permission tests go in `*.permissions.spec.ts`
- Use `test.step("description", async () => { ... })` for multi-step tests
- Mark known bugs with `test.skip(true, "Bug XXXXX: description")`

## Running tests
```bash
# Run all tests
npm test

# Run a specific test
npx playwright test --grep "test name"

# Run a specific file
npx playwright test src/tests/rooms/rooms.spec.ts

# Check types and lint before pushing
npm run tsc
npm run lint
```

## Example: writing a new functional test

**Task:** "Напиши тест: owner обновляет title комнаты"

1. Open `src/tests/rooms/rooms.spec.ts`
2. Add inside the relevant `test.describe` block:

```ts
test("PUT /files/rooms/:id - Owner updates room title", async ({ apiSdk }) => {
  // Setup: create a room
  const { data: created } = await apiSdk.forRole("owner").rooms.createRoom({
    title: "Original Title",
    roomType: RoomType.CustomRoom,
  });
  const roomId = created.response!.id!;

  // Action
  const { data, status } = await apiSdk.forRole("owner").rooms.updateRoom(roomId, {
    title: "Updated Title",
  });

  // Assert
  expect(status).toBe(200);
  expect(data.response?.title).toBe("Updated Title");
});
```

## Example: writing a permission test

**Task:** "Напиши тест: guest не может создать комнату"

```ts
test("POST /files/rooms - Guest cannot create a room", async ({ apiSdk }) => {
  await apiSdk.addMember("owner", "Guest");

  const { status } = await apiSdk.forRole("guest").rooms.createRoom({
    title: "Room",
    roomType: RoomType.CustomRoom,
  });

  expect(status).toBe(403);
});
```
