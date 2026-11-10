import { expect } from "@playwright/test";
import {
  CreateServiceLimitRequestDto,
  OperationDto,
  PaymentApi,
  ServiceLimitDto,
  ServiceLimitPeriod,
  ServiceLimitReportDto,
  ServiceLimitScope,
  ServiceLimitUsageDto,
  UpdateServiceLimitRequestDto,
} from "@onlyoffice/docspace-api-sdk";
import { AiAgentChat, AiProfile } from "./ai-agent-chat";
import { AgentRole } from "./ai-http";
import { AiWebSearch } from "./ai-web-search";
import {
  enableAiGateway,
  getServiceOperations,
  setAiSearchAddon,
} from "./wallet-services";
import { ApiSDK } from "@/src/services/api-sdk";
import { PaymentApi as PortalPaymentApi } from "@/src/services/payment-api";

// Spending limits on the AI services (`/portal/payment/servicelimit`).
//
// What the server really does, measured 2026-11-02 and worth knowing before
// reading a test built on these helpers:
//
//   * the request enums are numbers (Total=1, Global=2, Custom=3; Day=1 ..
//     Lifetime=4) but every response spells them as strings ("Total", "Month"),
//     so the SDK's numeric enum types are wrong on the way back - `scopeName` and
//     `periodName` read them as the strings they are;
//   * `amountValue` is accepted from 0 to 10000 in USD, with arbitrary decimals;
//     an omitted `period` becomes Day;
//   * a limit that is read on its own carries no `usage`; the Total limit and
//     the per-user list do;
//   * the AI request that hits the ceiling is refused with
//       chat   : HTTP 200 stream, `message-incomplete`, error {code:"auth",
//                message:"403 Service limit exceeded: ..."} stored on the reply
//       search : HTTP 403 {error:{type:"payment_error", code:"payment_error",
//                message:"Service limit exceeded: ..."}}
//   * spend is booked asynchronously: the billing row and the limit's `usage`
//     lag the reply by a few seconds, so every read of spend polls for it.

export const LimitScope = ServiceLimitScope;
export const LimitPeriod = ServiceLimitPeriod;

/** The refusal text both AI routes carry when a limit is the reason. */
export const LIMIT_EXCEEDED = /Service limit exceeded/;

/** How the server spells an enum back, regardless of the SDK's numeric type. */
export const scopeName = (dto: { scope?: unknown } | undefined) =>
  String(dto?.scope);
export const periodName = (dto: { period?: unknown } | undefined) =>
  String(dto?.period);

/** The `error.message` of a failed call, whichever envelope carried it. */
export function errorMessage(data: unknown): string | undefined {
  const body = data as
    | { error?: { message?: string } | string; message?: string }
    | undefined;
  if (typeof body?.error === "string") return body.error;
  return body?.error?.message ?? body?.message;
}

type Payment = PaymentApi;

export async function createLimit(
  payment: Payment,
  dto: CreateServiceLimitRequestDto,
): Promise<ServiceLimitDto> {
  const { data, status } = await payment.createServiceLimit({
    createServiceLimitRequestDto: dto,
  });
  expect(status, `POST servicelimit ${JSON.stringify(dto)}`).toBe(200);
  expect(data.response?.id, "the created limit has an id").toBeDefined();
  return data.response!;
}

export const createTotal = (
  payment: Payment,
  amountValue: number,
  period: ServiceLimitPeriod = ServiceLimitPeriod.Month,
) =>
  createLimit(payment, {
    scope: ServiceLimitScope.Total,
    amountValue,
    period,
  });

export const createGlobal = (
  payment: Payment,
  amountValue: number,
  period: ServiceLimitPeriod = ServiceLimitPeriod.Day,
) =>
  createLimit(payment, {
    scope: ServiceLimitScope.Global,
    amountValue,
    period,
  });

export const createCustom = (
  payment: Payment,
  userId: string,
  amountValue: number,
  period: ServiceLimitPeriod = ServiceLimitPeriod.Day,
) =>
  createLimit(payment, {
    scope: ServiceLimitScope.Custom,
    userId,
    amountValue,
    period,
  });

export async function updateLimit(
  payment: Payment,
  dto: UpdateServiceLimitRequestDto,
): Promise<ServiceLimitDto> {
  const { data, status } = await payment.updateServiceLimit({
    updateServiceLimitRequestDto: dto,
  });
  expect(status, `PUT servicelimit ${JSON.stringify(dto)}`).toBe(200);
  return data.response!;
}

export async function deleteLimit(payment: Payment, id: number) {
  const { status } = await payment.deleteServiceLimit({ id });
  expect(status, `DELETE servicelimit/${id}`).toBe(200);
}

/** `undefined` when no Total limit is set: the answer is 200 with no `response`. */
export async function readTotal(payment: Payment) {
  const { data, status } = await payment.getTotalServiceLimit();
  expect(status, "GET servicelimit/total").toBe(200);
  return data.response ?? undefined;
}

export async function readGlobal(payment: Payment) {
  const { data, status } = await payment.getGlobalServiceLimit();
  expect(status, "GET servicelimit/global").toBe(200);
  return data.response ?? undefined;
}

export async function readLimit(payment: Payment, id: number) {
  const { data, status } = await payment.getServiceLimit({ id });
  expect(status, `GET servicelimit/${id}`).toBe(200);
  return data.response!;
}

export async function listLimits(
  payment: Payment,
  params: Parameters<Payment["getParticipantServiceLimits"]>[0] = {},
): Promise<ServiceLimitReportDto> {
  const { data, status } = await payment.getParticipantServiceLimits(params);
  expect(status, "GET servicelimit/participants").toBe(200);
  return data.response!;
}

/** The limit that applies to one user, as the per-user list shows it. */
export async function limitOfUser(
  payment: Payment,
  userId: string,
): Promise<ServiceLimitDto | undefined> {
  const report = await listLimits(payment, { limit: 100 });
  return (report.collection ?? []).find((item) => item.userId === userId);
}

/** Polls `read` until `done` holds; the last value is returned on a timeout. */
export async function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 90000, intervalMs = 1500 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ------------------------------------------------------------------ AI side

/**
 * The billing customer every limit call needs: payment set up and the wallet
 * funded once. `setupPayment` alone is not enough - creating a limit on a portal
 * in that half-way state answers 500.
 */
export async function provisionBilling(
  paymentsApi: Pick<PortalPaymentApi, "setupPayment" | "makeWalletTopUp">,
) {
  await paymentsApi.setupPayment();
  await paymentsApi.makeWalletTopUp(1000);
}

/** The model line-up and the owner-side clients every spending test starts from. */
export type AiPortal = {
  payment: Payment;
  ownerChat: AiAgentChat;
  profile: AiProfile;
  profiles: AiProfile[];
};

/**
 * A funded portal with AI Tools and the AI search add-on switched on - the state
 * in which both AI services can be spent against a limit. The portal has to have
 * a billing customer first: without one every limit call answers 404.
 */
export async function provisionAiPortal(
  apiSdk: ApiSDK,
  paymentsApi: PortalPaymentApi,
): Promise<AiPortal> {
  const payment = apiSdk.forRole("owner").payment;
  await enableAiGateway(paymentsApi, payment);
  await setAiSearchAddon(payment, true);
  const ownerChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profiles = await ownerChat.listProfiles("owner");
  return {
    payment,
    ownerChat,
    profile: AiAgentChat.pickTextProfile(profiles),
    profiles,
  };
}

const CHAT_PROMPT = "In one short sentence: what is a spreadsheet for?";

export type ChatOutcome = {
  kind: "replied" | "limit" | "error";
  threadId: string;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * One chat turn in a thread of its own, classified by what was stored: a reply
 * the model finished, a refusal that names the service limit, or any other
 * failure. The HTTP status says nothing here - a refused send is still 200.
 */
export async function chatOutcome(
  chat: AiAgentChat,
  role: AgentRole,
  options: {
    profileId: string;
    agentId?: number;
    threadId?: string;
    message?: string;
  },
): Promise<ChatOutcome> {
  const threadId =
    options.threadId ??
    (await chat.createThreadId(role, {
      title: "Limits chat",
      profileId: options.profileId,
      agentId: options.agentId,
    }));
  await chat.sendMessage(role, {
    threadId,
    agentId: options.agentId,
    profileId: options.profileId,
    message: options.message ?? CHAT_PROMPT,
    timeoutMs: 240000,
  });
  const messages = await chat.waitForAssistantReply(role, threadId);
  const reply = AiAgentChat.assistantMessages(messages).at(-1)!;
  const error = AiAgentChat.messageStatus(reply)?.error;
  if (!error) {
    return AiAgentChat.messageText(reply).length > 0
      ? { kind: "replied", threadId }
      : { kind: "error", threadId, errorMessage: "empty reply" };
  }
  return {
    kind: LIMIT_EXCEEDED.test(error.message ?? "") ? "limit" : "error",
    threadId,
    errorCode: error.code,
    errorMessage: error.message,
  };
}

export type SearchOutcome = {
  kind: "results" | "limit" | "error";
  status: number;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
};

const SEARCH_BODY = { engine: "exa", query: "ONLYOFFICE Docs", numResults: 1 };

/** One AI search through the passthrough route the editor plugin uses. */
export async function searchOutcome(
  search: AiWebSearch,
  role: AgentRole,
): Promise<SearchOutcome> {
  const { status, data } = await search.passthroughSearch(role, SEARCH_BODY);
  if (status === 200) return { kind: "results", status };
  const error = (
    data as
      | { error?: { message?: string; type?: string; code?: string } }
      | undefined
  )?.error;
  return {
    kind: LIMIT_EXCEEDED.test(error?.message ?? "") ? "limit" : "error",
    status,
    errorType: error?.type,
    errorCode: error?.code,
    errorMessage: error?.message,
  };
}

/** Every AI charge (chat and search) booked to one participant. */
export async function aiCharges(
  payment: Payment,
  participantId: string,
): Promise<OperationDto[]> {
  const rows = [
    ...(await getServiceOperations(payment, "aiTools")),
    ...(await getServiceOperations(payment, "aiSearch")),
  ];
  return rows.filter((row) => row.participantName === participantId);
}

export const chargeSum = (rows: OperationDto[]) =>
  rows.reduce((sum, row) => sum + (row.debit ?? 0), 0);

/** Waits until at least `count` charges are booked to the participant. */
export async function waitForCharges(
  payment: Payment,
  participantId: string,
  count: number,
): Promise<OperationDto[]> {
  const rows = await pollUntil(
    () => aiCharges(payment, participantId),
    (value) => value.length >= count,
  );
  expect(
    rows.length,
    `AI charges booked to ${participantId} (waiting for ${count})`,
  ).toBeGreaterThanOrEqual(count);
  return rows;
}

/**
 * The usage of the limit that applies to `participantId`, or of the Total limit
 * when none is given, once it has caught up with the billing rows: spend equals
 * what the participant was charged and no reservation is left hanging.
 */
export async function settledUsage(
  payment: Payment,
  participantId: string | undefined,
  expectedCharges: number,
): Promise<ServiceLimitUsageDto> {
  const read = async () => {
    const all = participantId
      ? await aiCharges(payment, participantId)
      : [
          ...(await getServiceOperations(payment, "aiTools")),
          ...(await getServiceOperations(payment, "aiSearch")),
        ];
    const usage = participantId
      ? (await limitOfUser(payment, participantId))?.usage
      : (await readTotal(payment))?.usage;
    return { usage, all };
  };
  const { usage, all } = await pollUntil(
    read,
    ({ usage: u, all: rows }) =>
      rows.length >= expectedCharges &&
      u !== undefined &&
      Math.abs((u.amountConsumed ?? 0) - chargeSum(rows)) < 1e-9,
  );
  expect(usage, "usage of the limit").toBeDefined();
  expect(
    usage!.amountConsumed,
    "the limit's amountConsumed equals the billed charges",
  ).toBeCloseTo(chargeSum(all), 9);
  return usage!;
}
