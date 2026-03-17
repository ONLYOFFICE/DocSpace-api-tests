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
  ProvidersApi,
  ChatApi,
} from "@onlyoffice/docspace-api-sdk";
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
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext, tokenStore: TokenStore) {
    this.request = request;
    this.tokenStore = tokenStore;
    this.faker = new FAKER();
  }

  private createAxiosInstance() {
    const axiosInstance = axios.create({
      validateStatus: () => true, // never throw, regardless of status code
    });
    axiosInstance.defaults.adapter = createPlaywrightAdapter(this.request);
    return axiosInstance;
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

  async authenticateOwner(): Promise<ReturnType<ApiSDK["forRole"]>> {
    const authResponse = await this.request.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/authentication`,
      {
        data: {
          userName: config.DOCSPACE_OWNER_EMAIL,
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
        "formCollection",
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
