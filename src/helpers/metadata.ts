import {
  MetadataConflictResolveType,
  MetadataFieldType,
} from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";

type OwnerApi = ReturnType<ApiSDK["forRole"]>;

/**
 * Creates a metadata template as the given client and returns its ID.
 * Template names are unique per portal, so the name is randomised.
 */
export async function createTemplateWithFields(
  api: OwnerApi,
  apiSdk: ApiSDK,
  fields: Array<{
    name?: string;
    type?: MetadataFieldType;
    options?: { value: string }[];
  }> = [{ type: MetadataFieldType.String }],
) {
  const name = `Autotest tpl ${apiSdk.faker.generateString(8)}`;
  const { data, status } = await api.metadata.createTemplate({
    createMetadataTemplateRequestDto: {
      name,
      fields: fields.map((f, i) => ({
        name: f.name ?? `field${i}_${apiSdk.faker.generateString(4)}`,
        type: f.type ?? MetadataFieldType.String,
        options: f.options,
      })),
    },
  });
  if (status !== 200) {
    throw new Error(`createTemplate failed: ${status}`);
  }
  return { id: data.response!.id!, name, template: data.response! };
}

/**
 * Polls the cascade pass of a folder until it finishes and returns its final
 * state.
 *
 * - Bounded by `timeoutMs`; the timeout error carries the last state seen.
 * - Polls with a growing interval, no fixed sleep after the work is done.
 * - Success needs `isCompleted === true`, an empty `error` and `progress`
 *   of 100; anything else (missing flag, error text, partial progress) is
 *   never taken for success.
 * - With `operationId` (the `id` of the assign/update answer) a report of
 *   another pass is ignored, so a stale completed pass cannot end the wait.
 */
export async function waitForCascade(
  api: OwnerApi,
  folderId: number,
  options: { operationId?: string | null; timeoutMs?: number } = {},
) {
  const { operationId, timeoutMs = 60_000 } = options;
  const deadline = Date.now() + timeoutMs;
  const intervals = [250, 500, 1000, 2000];
  let last: unknown = undefined;

  for (let attempt = 0; ; attempt++) {
    const { data, status } = await api.metadata.getCascadeProgress({
      folderId,
    });
    if (status !== 200) {
      throw new Error(
        `getCascadeProgress(${folderId}) returned ${status}: ${JSON.stringify(data)}`,
      );
    }
    const op = data.response!;
    last = op;

    const isThisPass = !operationId || op.id === operationId;
    if (isThisPass && op.isCompleted === true) {
      if (op.error) {
        throw new Error(
          `Cascade of folder ${folderId} failed: ${JSON.stringify(op)}`,
        );
      }
      if (op.progress !== 100) {
        throw new Error(
          `Cascade of folder ${folderId} completed without reaching 100%: ${JSON.stringify(op)}`,
        );
      }
      return op;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Cascade of folder ${folderId} did not finish within ${timeoutMs} ms` +
          (operationId ? ` (waiting for pass ${operationId})` : "") +
          `. Last state: ${JSON.stringify(last)}`,
      );
    }
    await new Promise((r) =>
      setTimeout(r, intervals[Math.min(attempt, intervals.length - 1)]),
    );
  }
}

/**
 * Assigns templates to a folder with `cascade: true`, checks that a pass was
 * queued and waits for exactly that pass.
 */
export async function assignWithCascade(
  api: OwnerApi,
  folderId: number,
  templateIds: number[],
  conflictResolveType?: MetadataConflictResolveType,
) {
  const { data, status } = await api.metadata.assignFolderTemplates({
    folderId,
    assignMetadataTemplates: {
      templateIds,
      cascade: true,
      conflictResolveType,
    },
  });
  if (status !== 200 || !data.response?.id) {
    throw new Error(
      `cascade assign on folder ${folderId} did not queue a pass: ${status} ${JSON.stringify(data)}`,
    );
  }
  return waitForCascade(api, folderId, { operationId: data.response.id });
}

/** Turns the cascade of an assigned template on and waits for the pass. */
export async function updateWithCascade(
  api: OwnerApi,
  folderId: number,
  templateId: number,
  conflictResolveType?: MetadataConflictResolveType,
) {
  const { data, status } = await api.metadata.updateFolderTemplate({
    folderId,
    templateId,
    updateFolderMetadataTemplateRequest: {
      cascade: true,
      conflictResolveType,
    },
  });
  if (status !== 200 || !data.response?.id) {
    throw new Error(
      `cascade update on folder ${folderId} did not queue a pass: ${status} ${JSON.stringify(data)}`,
    );
  }
  return waitForCascade(api, folderId, { operationId: data.response.id });
}
