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
  // The server rejects an archive without plugin.js ("The required entry
  // plugin.js not found"), so both entries are stored.
  const entries = [
    { name: "config.json", data: Buffer.from(configJson, "utf8") },
    { name: "plugin.js", data: Buffer.from("/* autotest plugin */", "utf8") },
  ];

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filename = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);

    const cd = Buffer.alloc(46 + filename.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(entry.data.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(filename.length, 28);
    cd.writeUInt32LE(offset, 42);
    filename.copy(cd, 46);

    locals.push(local, entry.data);
    centrals.push(cd);
    offset += local.length + entry.data.length;
  }

  const cdBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cdBuffer, eocd]);
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

// BUG 84321 (DELETE, fixed), BUG 83425 (PUT, fixed): DELETE and PUT /api/2.0/settings/webplugins/{name} return 404 when
// plugin name starts with: files-, privacyroom, people, group, accounts, keys,
// backup, plugins, migration, clients, scopes, oauth2, ai
test.describe("DELETE and PUT /api/2.0/settings/webplugins/{name} - reserved name prefix", () => {
  // BUG 84321 (fixed): DELETE /api/2.0/settings/webplugins/{name} returns 404 for plugin named 'files-*'
  test("BUG 84321: DELETE /api/2.0/settings/webplugins/{name} - Plugin with 'files-' prefix returns 404 instead of 200", async ({
    apiSdk,
  }) => {
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
  });

  // BUG 83425: PUT /api/2.0/settings/webplugins/{name} returns 404 for plugin named 'files-*'
  test("BUG 83425: PUT /api/2.0/settings/webplugins/{name} - Disabling plugin with 'files-' prefix returns 404 instead of 200", async ({
    apiSdk,
  }) => {
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
      webPluginRequest: { enabled: false, settings: null },
    });
    expect(status).toBe(200);
  });
});
