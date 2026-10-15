import { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";

import { cleanupRegisteredPortal } from "../../helpers/apisystem-registration";

// Offline: a fake request context stands in for the network.
type Reply = { status: number; body?: unknown } | Error;

function fakeContext(replies: { post?: Reply; delete?: Reply }) {
  const respond = async (reply: Reply | undefined) => {
    if (reply instanceof Error) throw reply;
    return {
      status: () => reply?.status ?? 500,
      json: async () => reply?.body ?? {},
    };
  };
  return {
    post: () => respond(replies.post),
    delete: () => respond(replies.delete),
  } as unknown as APIRequestContext;
}

const portal = { portalName: "p-1", domain: "p-1.onlyoffice.io" };
const owner = { email: "o@example.com", password: "x" };

test.describe("apisystem registration cleanup reporting", () => {
  test("a successful delete reports nothing", async () => {
    const ctx = fakeContext({ delete: { status: 200 } });
    expect(
      await cleanupRegisteredPortal(ctx, portal, "token", owner),
    ).toBeUndefined();
  });

  test("a non-200 delete is returned as an error, not thrown", async () => {
    const ctx = fakeContext({ delete: { status: 403 } });
    const error = await cleanupRegisteredPortal(ctx, portal, "token", owner);
    expect(error?.message).toContain("delete returned 403");
    expect(error?.message).toContain("may be orphaned");
  });

  test("a failing login during cleanup is returned as an error", async () => {
    const ctx = fakeContext({ post: { status: 429 } });
    const error = await cleanupRegisteredPortal(ctx, portal, undefined, owner);
    expect(error?.message).toContain("owner token unavailable");
  });

  test("a network failure during delete is returned as an error", async () => {
    const ctx = fakeContext({ delete: new Error("socket hang up") });
    const error = await cleanupRegisteredPortal(ctx, portal, "token", owner);
    expect(error?.message).toContain("socket hang up");
  });

  test("with no portal there is nothing to clean up", async () => {
    const ctx = fakeContext({});
    expect(
      await cleanupRegisteredPortal(ctx, undefined, undefined, owner),
    ).toBeUndefined();
  });
});
