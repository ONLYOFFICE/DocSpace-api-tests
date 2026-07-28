import { expect } from "@playwright/test";
import { RoomType, RoomGroupDto } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

/**
 * Icons that the room-group endpoints are expected to accept. Used by the
 * parametrized "all valid icons" tests. `"none"` is intentionally excluded —
 * it is the value the API rejects (BUG 80921 regression).
 */
export const VALID_GROUP_ICONS = ["star", "heart", "flag", "folder"] as const;

type GroupApi = ReturnType<ApiSDK["forRole"]>["groups"];
type RoomsApi = ReturnType<ApiSDK["forRole"]>["rooms"];

/**
 * Creates a plain Custom room and returns its id. Thin wrapper to cut down on
 * boilerplate in the group tests, which only ever need a room id to attach.
 */
export async function createRoomId(
  rooms: RoomsApi,
  title: string,
): Promise<number> {
  const { data } = await rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  return data.response!.id!;
}

/**
 * Creates N plain Custom rooms and returns their ids.
 */
export async function createRoomIds(
  rooms: RoomsApi,
  count: number,
  prefix = "Group Room",
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await createRoomId(rooms, `${prefix} ${i + 1}`));
  }
  return ids;
}

/**
 * Creates a room group and returns the created DTO plus its id. Uses a default
 * valid icon and a single freshly created room unless overridden.
 */
export async function createRoomGroup(
  groups: GroupApi,
  opts: { name: string; icon?: string; rooms: number[] },
): Promise<{ id: number; data: RoomGroupDto }> {
  const { data, status } = await groups.addRoomGroup({
    roomGroupRequestDto: {
      name: opts.name,
      icon: opts.icon ?? "star",
      rooms: opts.rooms,
    },
  });
  expect(status, "room group setup should succeed").toBe(200);
  return { id: data.response!.id!, data: data.response! };
}

/**
 * Asserts the shape/contract of a RoomGroupDto returned by any of the six group
 * endpoints. Centralised so every positive test enforces the same contract.
 */
export function expectRoomGroupShape(response: RoomGroupDto | undefined) {
  expect(response).toBeDefined();
  const dto = response!;
  expect(typeof dto.id).toBe("number");
  expect(dto.id!).toBeGreaterThan(0);
  expect(typeof dto.name).toBe("string");
  expect(typeof dto.userId).toBe("string");
  expect(typeof dto.totalRooms).toBe("number");
  expect(dto.totalRooms!).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(dto.rooms)).toBe(true);
  expect(dto.icon).toBeDefined();
  // totalRooms must match the number of rooms actually returned
  expect(dto.totalRooms).toBe(dto.rooms!.length);
  // no duplicate rooms by title (FileEntryBaseDto has no id, see memory)
  const titles = dto.rooms!.map((r) => r.title);
  expect(new Set(titles).size).toBe(titles.length);
}

/**
 * Low-level request against the room-group endpoints with full control over
 * method, path, body, and headers. Needed for validation / HTTP-contract tests
 * that the typed SDK cannot express (raw bodies, wrong types, malformed JSON,
 * unsupported methods, missing/invalid auth).
 *
 * `role`:
 *   - a Role   -> Authorization: Bearer <that role's token>
 *   - null     -> no Authorization header (anonymous)
 *   - undefined-> defaults to "owner"
 * `token` overrides the Authorization header verbatim (invalid-token tests).
 * `body`: object -> JSON.stringify; string/Buffer -> sent verbatim.
 * `contentType`: null omits the header entirely.
 */
export async function roomGroupRaw(
  apiSdk: ApiSDK,
  opts: {
    role?: Role | null;
    token?: string;
    method?: string;
    path?: string;
    query?: string;
    body?: unknown;
    contentType?: string | null;
    omitBody?: boolean;
  },
): Promise<{ status: number; data: any; text: string }> {
  const { tokenStore, request } = apiSdk;
  let url = `${tokenStore.portalBaseUrl}/api/2.0/files/group${opts.path ?? ""}`;
  if (opts.query) url += `?${opts.query}`;

  const headers: Record<string, string> = {
    Origin: `http://${tokenStore.newTenantDomain}`,
  };

  if (opts.token !== undefined) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  } else if (opts.role !== null) {
    headers["Authorization"] = `Bearer ${tokenStore.getToken(
      opts.role ?? "owner",
    )}`;
  }

  const fetchOptions: {
    method: string;
    headers: Record<string, string>;
    data?: string | Buffer;
  } = { method: opts.method ?? "POST", headers };

  if (!opts.omitBody && opts.body !== undefined) {
    if (opts.contentType !== null) {
      headers["Content-Type"] = opts.contentType ?? "application/json";
    }
    fetchOptions.data =
      typeof opts.body === "string" || Buffer.isBuffer(opts.body)
        ? (opts.body as string | Buffer)
        : JSON.stringify(opts.body);
  } else if (opts.contentType && opts.contentType !== null) {
    headers["Content-Type"] = opts.contentType;
  }

  const response = await request.fetch(url, fetchOptions);
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw text for non-JSON responses
  }
  return { status: response.status(), data: data as any, text };
}
