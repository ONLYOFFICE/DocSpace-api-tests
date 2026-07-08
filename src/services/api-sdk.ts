import { APIRequestContext } from "@playwright/test";
import { TokenStore, Role } from "./token-store";
import { FAKER, FakeUser } from "../utils/faker";
import axios from "axios";
import {
  Configuration,
  FilesApi,
  FoldersApi,
  RoomsApi,
  OperationsApi,
  SharingApi,
  ProfilesApi,
  PasswordApi,
  UserStatusApi,
  PeopleQuotaApi,
  EmailApi,
  BackupApi,
  GreetingSettingsApi,
  LoginSettingsApi,
  SettingsAuthorizationApi,
  ThirdPartyIntegrationApi,
  EmployeeFullWrapper,
  GuestsApi,
  PeopleSearchApi,
  ThemeApi,
  ThirdPartyAccountsApi,
  UserDataApi,
  UserTypeApi,
  PhotosApi,
  SecurityApi,
  AgentsApi,
  GroupsApi,
  GroupApi,
  SearchApi as GroupSearchApi,
  ProvidersApi,
  ChatApi,
  SettingsQuotaApi,
  PaymentApi as SdkPaymentApi,
  MessagesApi,
  SettingsMessagesApi,
  CommonSettingsApi,
  SettingsApi as AiSettingsApi,
  UsersApi,
} from "@onlyoffice/docspace-api-sdk";
import { VectorizationApi } from "@onlyoffice/docspace-api-sdk/dist/api/ai/vectorization-api";
import { MCPApi } from "@onlyoffice/docspace-api-sdk/dist/api/ai/mcpapi";
import { PortalGuestsApi } from "@onlyoffice/docspace-api-sdk/dist/api/portal/portal-guests-api";
import { ApiKeysApi } from "@onlyoffice/docspace-api-sdk/dist/api/api-keys/api-keys-api";
import { AuthenticationApi } from "@onlyoffice/docspace-api-sdk/dist/api/authentication/authentication-api";
import { CapabilitiesApi } from "@onlyoffice/docspace-api-sdk/dist/api/capabilities/capabilities-api";
import { MigrationApi } from "@onlyoffice/docspace-api-sdk/dist/api/migration/migration-api";
import { ScopeManagementApi } from "@onlyoffice/docspace-api-sdk/dist/api/oauth20/scope-management-api";
import { ClientManagementApi } from "@onlyoffice/docspace-api-sdk/dist/api/oauth20/client-management-api";
import { ClientQueryingApi } from "@onlyoffice/docspace-api-sdk/dist/api/oauth20/client-querying-api";
import { OAuth2Api } from "@onlyoffice/docspace-api-sdk/dist/api/security/oauth2-api";
import { SecurityAccessToDevToolsApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/security-access-to-dev-tools-api";
import { FilesSettingsApi } from "@onlyoffice/docspace-api-sdk/dist/api/files/files-settings-api";
import { AuditTrailDataApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/audit-trail-data-api";
import { SecurityBannersVisibilityApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/security-banners-visibility-api";
import { CSPApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/cspapi";
import { LoginHistoryApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/login-history-api";
import { SMTPSettingsApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/smtpsettings-api";
import { ActiveConnectionsApi } from "@onlyoffice/docspace-api-sdk/dist/api/security/active-connections-api";
import { TFASettingsApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/tfasettings-api";
import { AccessToDevToolsApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/access-to-dev-tools-api";
import { BannersVisibilityApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/banners-visibility-api";
import { CookiesApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/cookies-api";
import { IPRestrictionsApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/iprestrictions-api";
import { NotificationsApi } from "@onlyoffice/docspace-api-sdk/dist/api/settings/notifications-api";
import { PortalQuotaApi } from "@onlyoffice/docspace-api-sdk/dist/api/portal/portal-quota-api";
import { PortalSettingsApi } from "@onlyoffice/docspace-api-sdk/dist/api/portal/portal-settings-api";
import { QuotaApi } from "@onlyoffice/docspace-api-sdk/dist/api/files/quota-api";
import { createPlaywrightAdapter } from "../utils/playwright-axios-adapter";
import { parseResponse } from "../utils/parse-response";
import config from "../../config";
import { waitForRoomTemplate } from "../helpers/wait-for-room-template";

export type UserType = "DocSpaceAdmin" | "RoomAdmin" | "User" | "Guest";

const USER_TYPE_TO_ROLE: Record<UserType, Role> = {
  DocSpaceAdmin: "docSpaceAdmin",
  RoomAdmin: "roomAdmin",
  User: "user",
  Guest: "guest",
};

type MemberBase = {
  data: EmployeeFullWrapper;
  status: number;
  userData: FakeUser;
};

export type AddMemberResult = MemberBase;
export type AddAuthenticatedMemberResult = MemberBase & {
  api: ReturnType<ApiSDK["forRole"]>;
};

export class ApiSDK {
  readonly faker: FAKER;
  readonly tokenStore: TokenStore;
  readonly request: APIRequestContext;

  constructor(request: APIRequestContext, tokenStore: TokenStore) {
    this.request = request;
    this.tokenStore = tokenStore;
    this.faker = new FAKER();
  }

  createAxiosInstance() {
    const axiosInstance = axios.create({
      validateStatus: () => true, // never throw, regardless of status code
    });
    axiosInstance.defaults.adapter = createPlaywrightAdapter(this.request);
    return axiosInstance;
  }

  forApiKey(apiKey: string) {
    const config = new Configuration({
      basePath: `${this.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    });
    const axiosInstance = this.createAxiosInstance();
    return {
      apiKeys: new ApiKeysApi(config, undefined, axiosInstance),
      files: new FilesApi(config, undefined, axiosInstance),
      folders: new FoldersApi(config, undefined, axiosInstance),
      rooms: new RoomsApi(config, undefined, axiosInstance),
      profiles: new ProfilesApi(config, undefined, axiosInstance),
    };
  }

  forToken(token: string) {
    const config = new Configuration({
      basePath: `${this.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    });
    const axiosInstance = this.createAxiosInstance();
    return {
      activeConnections: new ActiveConnectionsApi(
        config,
        undefined,
        axiosInstance,
      ),
    };
  }

  forRole(role: Role) {
    const config = new Configuration({
      basePath: `${this.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${this.tokenStore.getToken(role)}`,
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    });
    const axiosInstance = this.createAxiosInstance();
    return {
      rooms: new RoomsApi(config, undefined, axiosInstance),
      files: new FilesApi(config, undefined, axiosInstance),
      folders: new FoldersApi(config, undefined, axiosInstance),
      groups: new GroupsApi(config, undefined, axiosInstance),
      groupApi: new GroupApi(config, undefined, axiosInstance),
      groupSearch: new GroupSearchApi(config, undefined, axiosInstance),
      operations: new OperationsApi(config, undefined, axiosInstance),
      sharing: new SharingApi(config, undefined, axiosInstance),
      profiles: new ProfilesApi(config, undefined, axiosInstance),
      password: new PasswordApi(config, undefined, axiosInstance),
      userStatus: new UserStatusApi(config, undefined, axiosInstance),
      peopleQuota: new PeopleQuotaApi(config, undefined, axiosInstance),
      email: new EmailApi(config, undefined, axiosInstance),
      backup: new BackupApi(config, undefined, axiosInstance),
      greetingSettings: new GreetingSettingsApi(
        config,
        undefined,
        axiosInstance,
      ),
      loginSettings: new LoginSettingsApi(config, undefined, axiosInstance),
      settingsAuthorization: new SettingsAuthorizationApi(
        config,
        undefined,
        axiosInstance,
      ),
      thirdPartyIntegration: new ThirdPartyIntegrationApi(
        config,
        undefined,
        axiosInstance,
      ),
      guests: new GuestsApi(config, undefined, axiosInstance),
      portalGuests: new PortalGuestsApi(config, undefined, axiosInstance),
      peopleSearch: new PeopleSearchApi(config, undefined, axiosInstance),
      theme: new ThemeApi(config, undefined, axiosInstance),
      thirdPartyAccounts: new ThirdPartyAccountsApi(
        config,
        undefined,
        axiosInstance,
      ),
      userData: new UserDataApi(config, undefined, axiosInstance),
      userType: new UserTypeApi(config, undefined, axiosInstance),
      photos: new PhotosApi(config, undefined, axiosInstance),
      security: new SecurityApi(config, undefined, axiosInstance),
      agents: new AgentsApi(config, undefined, axiosInstance),
      providers: new ProvidersApi(config, undefined, axiosInstance),
      chat: new ChatApi(config, undefined, axiosInstance),
      settingsQuota: new SettingsQuotaApi(config, undefined, axiosInstance),
      payment: new SdkPaymentApi(config, undefined, axiosInstance),
      settingsMessages: new SettingsMessagesApi(
        config,
        undefined,
        axiosInstance,
      ),
      commonSettings: new CommonSettingsApi(config, undefined, axiosInstance),
      aiSettings: new AiSettingsApi(config, undefined, axiosInstance),
      vectorization: new VectorizationApi(config, undefined, axiosInstance),
      messages: new MessagesApi(config, undefined, axiosInstance),
      users: new UsersApi(config, undefined, axiosInstance),
      mcp: new MCPApi(config, undefined, axiosInstance),
      apiKeys: new ApiKeysApi(config, undefined, axiosInstance),
      portalQuota: new PortalQuotaApi(config, undefined, axiosInstance),
      portalSettings: new PortalSettingsApi(config, undefined, axiosInstance),
      authentication: new AuthenticationApi(config, undefined, axiosInstance),
      tfaSettings: new TFASettingsApi(config, undefined, axiosInstance),
      capabilities: new CapabilitiesApi(config, undefined, axiosInstance),
      migration: new MigrationApi(config, undefined, axiosInstance),
      scopeManagement: new ScopeManagementApi(config, undefined, axiosInstance),
      clientManagement: new ClientManagementApi(
        config,
        undefined,
        axiosInstance,
      ),
      clientQuerying: new ClientQueryingApi(config, undefined, axiosInstance),
      oauth2: new OAuth2Api(config, undefined, axiosInstance),
      securityAccessToDevTools: new SecurityAccessToDevToolsApi(
        config,
        undefined,
        axiosInstance,
      ),
      activeConnections: new ActiveConnectionsApi(
        config,
        undefined,
        axiosInstance,
      ),
      filesSettings: new FilesSettingsApi(config, undefined, axiosInstance),
      roomQuota: new QuotaApi(config, undefined, axiosInstance),
      auditTrail: new AuditTrailDataApi(config, undefined, axiosInstance),
      securityBanners: new SecurityBannersVisibilityApi(
        config,
        undefined,
        axiosInstance,
      ),
      csp: new CSPApi(config, undefined, axiosInstance),
      loginHistory: new LoginHistoryApi(config, undefined, axiosInstance),
      smtpSettings: new SMTPSettingsApi(config, undefined, axiosInstance),
      accessToDevTools: new AccessToDevToolsApi(
        config,
        undefined,
        axiosInstance,
      ),
      bannersVisibility: new BannersVisibilityApi(
        config,
        undefined,
        axiosInstance,
      ),
      cookies: new CookiesApi(config, undefined, axiosInstance),
      ipRestrictions: new IPRestrictionsApi(config, undefined, axiosInstance),
      notifications: new NotificationsApi(config, undefined, axiosInstance),
    };
  }

  forAnonymous() {
    const config = new Configuration({
      basePath: `${this.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: {
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    });
    const axiosInstance = this.createAxiosInstance();
    return {
      rooms: new RoomsApi(config, undefined, axiosInstance),
      files: new FilesApi(config, undefined, axiosInstance),
      folders: new FoldersApi(config, undefined, axiosInstance),
      groups: new GroupsApi(config, undefined, axiosInstance),
      groupApi: new GroupApi(config, undefined, axiosInstance),
      groupSearch: new GroupSearchApi(config, undefined, axiosInstance),
      sharing: new SharingApi(config, undefined, axiosInstance),
      profiles: new ProfilesApi(config, undefined, axiosInstance),
      password: new PasswordApi(config, undefined, axiosInstance),
      userStatus: new UserStatusApi(config, undefined, axiosInstance),
      peopleQuota: new PeopleQuotaApi(config, undefined, axiosInstance),
      email: new EmailApi(config, undefined, axiosInstance),
      backup: new BackupApi(config, undefined, axiosInstance),
      greetingSettings: new GreetingSettingsApi(
        config,
        undefined,
        axiosInstance,
      ),
      loginSettings: new LoginSettingsApi(config, undefined, axiosInstance),
      guests: new GuestsApi(config, undefined, axiosInstance),
      peopleSearch: new PeopleSearchApi(config, undefined, axiosInstance),
      theme: new ThemeApi(config, undefined, axiosInstance),
      thirdPartyAccounts: new ThirdPartyAccountsApi(
        config,
        undefined,
        axiosInstance,
      ),
      userData: new UserDataApi(config, undefined, axiosInstance),
      userType: new UserTypeApi(config, undefined, axiosInstance),
      photos: new PhotosApi(config, undefined, axiosInstance),
      security: new SecurityApi(config, undefined, axiosInstance),
      agents: new AgentsApi(config, undefined, axiosInstance),
      providers: new ProvidersApi(config, undefined, axiosInstance),
      chat: new ChatApi(config, undefined, axiosInstance),
      settingsQuota: new SettingsQuotaApi(config, undefined, axiosInstance),
      settingsMessages: new SettingsMessagesApi(
        config,
        undefined,
        axiosInstance,
      ),
      commonSettings: new CommonSettingsApi(config, undefined, axiosInstance),
      aiSettings: new AiSettingsApi(config, undefined, axiosInstance),
      vectorization: new VectorizationApi(config, undefined, axiosInstance),
      messages: new MessagesApi(config, undefined, axiosInstance),
      users: new UsersApi(config, undefined, axiosInstance),
      mcp: new MCPApi(config, undefined, axiosInstance),
      apiKeys: new ApiKeysApi(config, undefined, axiosInstance),
      portalQuota: new PortalQuotaApi(config, undefined, axiosInstance),
      portalSettings: new PortalSettingsApi(config, undefined, axiosInstance),
      payment: new SdkPaymentApi(config, undefined, axiosInstance),
      authentication: new AuthenticationApi(config, undefined, axiosInstance),
      capabilities: new CapabilitiesApi(config, undefined, axiosInstance),
      migration: new MigrationApi(config, undefined, axiosInstance),
      scopeManagement: new ScopeManagementApi(config, undefined, axiosInstance),
      clientManagement: new ClientManagementApi(
        config,
        undefined,
        axiosInstance,
      ),
      clientQuerying: new ClientQueryingApi(config, undefined, axiosInstance),
      securityAccessToDevTools: new SecurityAccessToDevToolsApi(
        config,
        undefined,
        axiosInstance,
      ),
      activeConnections: new ActiveConnectionsApi(
        config,
        undefined,
        axiosInstance,
      ),
      auditTrail: new AuditTrailDataApi(config, undefined, axiosInstance),
      securityBanners: new SecurityBannersVisibilityApi(
        config,
        undefined,
        axiosInstance,
      ),
      csp: new CSPApi(config, undefined, axiosInstance),
      loginHistory: new LoginHistoryApi(config, undefined, axiosInstance),
      oauth2: new OAuth2Api(config, undefined, axiosInstance),
      smtpSettings: new SMTPSettingsApi(config, undefined, axiosInstance),
      accessToDevTools: new AccessToDevToolsApi(
        config,
        undefined,
        axiosInstance,
      ),
      bannersVisibility: new BannersVisibilityApi(
        config,
        undefined,
        axiosInstance,
      ),
      cookies: new CookiesApi(config, undefined, axiosInstance),
      ipRestrictions: new IPRestrictionsApi(config, undefined, axiosInstance),
      notifications: new NotificationsApi(config, undefined, axiosInstance),
      settingsAuthorization: new SettingsAuthorizationApi(
        config,
        undefined,
        axiosInstance,
      ),
      roomQuota: new QuotaApi(config, undefined, axiosInstance),
      filesSettings: new FilesSettingsApi(config, undefined, axiosInstance),
    };
  }

  async waitForRoomTemplateReady(role: Role) {
    const api = this.forRole(role);
    return waitForRoomTemplate(api.rooms);
  }

  async addMember(creatorRole: Role, type: UserType): Promise<AddMemberResult> {
    const fakeUser = this.faker.generateUser();
    const userData = { ...fakeUser, type };

    const endpoint = type === "Guest" ? "people/active" : "people";
    const response = await this.request.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/${endpoint}`,
      {
        headers: {
          Authorization: `Bearer ${this.tokenStore.getToken(creatorRole)}`,
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
        data: userData,
      },
    );
    const data = await parseResponse(response);
    return { data, status: response.status(), userData: fakeUser };
  }

  async authenticateMember(
    userData: FakeUser,
    type: UserType,
  ): Promise<ReturnType<ApiSDK["forRole"]>> {
    const credentialRole = USER_TYPE_TO_ROLE[type];

    const authResponse = await this.request.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/authentication`,
      {
        data: {
          userName: userData.email,
          password: userData.password,
        },
        headers: {
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    );
    const authBody = await parseResponse(authResponse);
    if (!authResponse.ok()) {
      throw new Error(
        `Authentication failed for ${type}: ${authResponse.status()} - ${authBody.error || authBody.message}`,
      );
    }
    this.tokenStore.setToken(credentialRole, authBody.response.token);

    return this.forRole(credentialRole);
  }

  async authenticateOwner(
    email?: string,
  ): Promise<ReturnType<ApiSDK["forRole"]>> {
    const authResponse = await this.request.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/authentication`,
      {
        data: {
          userName: email ?? config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
        },
        headers: {
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    );
    const authBody = await parseResponse(authResponse);
    if (!authResponse.ok()) {
      throw new Error(
        `Authentication failed for owner: ${authResponse.status()} - ${authBody.error || authBody.message}`,
      );
    }
    this.tokenStore.setToken("owner", authBody.response.token);

    return this.forRole("owner");
  }

  async addAuthenticatedMember(
    creatorRole: Role,
    type: UserType,
  ): Promise<AddAuthenticatedMemberResult> {
    const base = await this.addMember(creatorRole, type);
    const api = await this.authenticateMember(base.userData, type);

    return { ...base, api };
  }

  async enableUserQuota(role: Role, defaultQuotaBytes: number) {
    await this.request.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/settings/userquotasettings`,
      {
        headers: {
          Authorization: `Bearer ${this.tokenStore.getToken(role)}`,
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
        data: { enableQuota: true, defaultQuota: defaultQuotaBytes },
      },
    );
  }

  async insertBinaryFile(
    role: Role,
    folderId: number,
    fileBuffer: Buffer,
    title: string,
  ) {
    const url = new URL(
      `${this.tokenStore.portalBaseUrl}/api/2.0/files/${folderId}/insert`,
    );
    url.searchParams.set("title", title);
    const response = await this.request.fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.tokenStore.getToken(role)}`,
        Origin: `http://${this.tokenStore.newTenantDomain}`,
        "Content-Type": "application/octet-stream",
      },
      data: fileBuffer,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    return { data: data as any, status: response.status() };
  }

  async uploadRoomLogo(role: Role, imageBuffer: Buffer) {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }),
      "logo.png",
    );

    const axiosInstance = this.createAxiosInstance();
    const response = await axiosInstance.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/files/logos`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.tokenStore.getToken(role)}`,
          Origin: `http://${this.tokenStore.newTenantDomain}`,
        },
      },
    );
    return { data: response.data, status: response.status };
  }

  async uploadMemberPhoto(
    role: Role,
    userId: string,
    imageBuffer: Buffer,
    options?: {
      fileName?: string;
      mimeType?: string;
      skipAuth?: boolean;
      skipFile?: boolean;
    },
  ) {
    const headers: Record<string, string> = {
      Origin: `http://${this.tokenStore.newTenantDomain}`,
    };

    if (!options?.skipAuth) {
      headers["Authorization"] = `Bearer ${this.tokenStore.getToken(role)}`;
    }

    const formData = new FormData();
    if (!options?.skipFile) {
      formData.append(
        "File",
        new Blob([new Uint8Array(imageBuffer)], {
          type: options?.mimeType ?? "image/png",
        }),
        options?.fileName ?? "avatar.png",
      );
      formData.append("Autosave", "true");
    }

    const axiosInstance = this.createAxiosInstance();
    const response = await axiosInstance.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/people/${userId}/photo`,
      formData,
      { headers },
    );
    return { data: response.data, status: response.status };
  }
}
