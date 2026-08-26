import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { Configuration } from "@onlyoffice/docspace-api-sdk";
import { WebpluginsApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/webplugins-api";
import { ApiSDK } from "@/src/services/api-sdk";
import { Role } from "@/src/services/token-store";

function makeCrc32Table(): number[] {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c);
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createPluginZip(pluginName: string): Buffer {
  const configJson = JSON.stringify({
    name: pluginName,
    version: "1.0.0",
    description: "Autotest plugin",
    scopes: "rooms",
    pluginName: pluginName.replace(/[^a-zA-Z0-9]/g, ""),
    author: "Autotest",
    license: "MIT",
    homePage: "",
  });
  const fileData = Buffer.from(configJson, "utf8");
  const filename = Buffer.from("config.json", "utf8");
  const crc = crc32(fileData);
  const fileSize = fileData.length;

  const local = Buffer.alloc(30 + filename.length);
  let o = 0;
  local.writeUInt32LE(0x04034b50, o);
  o += 4;
  local.writeUInt16LE(20, o);
  o += 2;
  local.writeUInt16LE(0, o);
  o += 2;
  local.writeUInt16LE(0, o);
  o += 2;
  local.writeUInt16LE(0, o);
  o += 2;
  local.writeUInt16LE(0, o);
  o += 2;
  local.writeUInt32LE(crc, o);
  o += 4;
  local.writeUInt32LE(fileSize, o);
  o += 4;
  local.writeUInt32LE(fileSize, o);
  o += 4;
  local.writeUInt16LE(filename.length, o);
  o += 2;
  local.writeUInt16LE(0, o);
  o += 2;
  filename.copy(local, o);

  const cd = Buffer.alloc(46 + filename.length);
  o = 0;
  cd.writeUInt32LE(0x02014b50, o);
  o += 4;
  cd.writeUInt16LE(20, o);
  o += 2;
  cd.writeUInt16LE(20, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt32LE(crc, o);
  o += 4;
  cd.writeUInt32LE(fileSize, o);
  o += 4;
  cd.writeUInt32LE(fileSize, o);
  o += 4;
  cd.writeUInt16LE(filename.length, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt16LE(0, o);
  o += 2;
  cd.writeUInt32LE(0, o);
  o += 4;
  cd.writeUInt32LE(0, o);
  o += 4;
  filename.copy(cd, o);

  const cdOffset = local.length + fileSize;

  const eocd = Buffer.alloc(22);
  o = 0;
  eocd.writeUInt32LE(0x06054b50, o);
  o += 4;
  eocd.writeUInt16LE(0, o);
  o += 2;
  eocd.writeUInt16LE(0, o);
  o += 2;
  eocd.writeUInt16LE(1, o);
  o += 2;
  eocd.writeUInt16LE(1, o);
  o += 2;
  eocd.writeUInt32LE(cd.length, o);
  o += 4;
  eocd.writeUInt32LE(cdOffset, o);
  o += 4;
  eocd.writeUInt16LE(0, o);

  return Buffer.concat([local, fileData, cd, eocd]);
}

async function uploadPlugin(
  apiSdk: ApiSDK,
  role: Role,
  pluginName: string,
): Promise<{ data: unknown; status: number }> {
  const zip = createPluginZip(pluginName);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(zip)], { type: "application/zip" }),
    "plugin.zip",
  );
  const axiosInstance = apiSdk.createAxiosInstance();
  const response = await axiosInstance.post(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/settings/webplugins`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  return { data: response.data, status: response.status };
}

function makeWebPluginsApi(apiSdk: ApiSDK, role: Role): WebpluginsApi {
  const config = new Configuration({
    basePath: apiSdk.tokenStore.portalBaseUrl,
    baseOptions: {
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  });
  return new WebpluginsApi(config, undefined, apiSdk.createAxiosInstance());
}

// BUG XXXXX: DELETE and PUT /api/2.0/settings/webplugins/{name} return 404 when
// plugin name starts with: files-, privacyroom, people, group, accounts, keys,
// backup, plugins, migration, clients, scopes, oauth2, ai
test.describe("DELETE and PUT /api/2.0/settings/webplugins/{name} - reserved name prefix", () => {
  // BUG XXXXX: DELETE /api/2.0/settings/webplugins/{name} returns 404 for plugin named 'files-*'
  test.fail(
    "BUG XXXXX: DELETE /api/2.0/settings/webplugins/{name} - Plugin with 'files-' prefix returns 404 instead of 200",
    async ({ apiSdk }) => {
      const pluginName = "files-autotest";

      const { status: uploadStatus } = await uploadPlugin(
        apiSdk,
        "owner",
        pluginName,
      );
      expect(uploadStatus).toBe(200);

      const webPlugins = makeWebPluginsApi(apiSdk, "owner");
      const { status } = await webPlugins.deleteWebPlugin({
        name: pluginName,
      });
      expect(status).toBe(200);
    },
  );

  // BUG 83425: PUT /api/2.0/settings/webplugins/{name} returns 404 for plugin named 'files-*'
  test.fail(
    "BUG 83425: PUT /api/2.0/settings/webplugins/{name} - Disabling plugin with 'files-' prefix returns 404 instead of 200",
    async ({ apiSdk }) => {
      const pluginName = "files-autotest";

      const { status: uploadStatus } = await uploadPlugin(
        apiSdk,
        "owner",
        pluginName,
      );
      expect(uploadStatus).toBe(200);

      const webPlugins = makeWebPluginsApi(apiSdk, "owner");
      const { status } = await webPlugins.updateWebPlugin({
        name: pluginName,
        webPluginRequests: { enabled: false, settings: null },
      });
      expect(status).toBe(200);
    },
  );
});
