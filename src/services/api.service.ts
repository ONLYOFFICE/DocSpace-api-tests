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
  EmployeeFullWrapper,
} from "@onlyoffice/docspace-api-sdk";
import { createPlaywrightAdapter } from "../utils/playwrightAxiosAdapter";
import { waitForOperation } from "../utils/waitForOperation";
import { waitForRoomTemplate } from "../utils/waitForRoomTemplate";

export type UserType = "DocSpaceAdmin" | "RoomAdmin" | "User" | "Guest";

const USER_TYPE_TO_ROLE: Record<UserType, Role> = {
  DocSpaceAdmin: "docSpaceAdmin",
  RoomAdmin: "roomAdmin",
  User: "user",
  Guest: "guest",
};

export type AddMemberResult = {
  data: EmployeeFullWrapper;
  status: number;
  userData: FakeUser;
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
      basePath: `https://${this.tokenStore.portalDomain}`,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${this.tokenStore.getToken(role)}`,
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
    };
  }

  forAnonymous() {
    const config = new Configuration({
      basePath: `https://${this.tokenStore.portalDomain}`,
    });
    const axiosInstance = this.createAxiosInstance();
    return {
      rooms: new RoomsApi(config, undefined, axiosInstance),
      files: new FilesApi(config, undefined, axiosInstance),
      folders: new FoldersApi(config, undefined, axiosInstance),
      profiles: new ProfilesApi(config, undefined, axiosInstance),
      password: new PasswordApi(config, undefined, axiosInstance),
      userStatus: new UserStatusApi(config, undefined, axiosInstance),
      peopleQuota: new PeopleQuotaApi(config, undefined, axiosInstance),
    };
  }

  async archiveRoom(role: Role, roomId: number) {
    const api = this.forRole(role);
    const { status } = await api.rooms.archiveRoom(roomId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(api.operations);
    return { status, operation };
  }

  async unarchiveRoom(role: Role, roomId: number) {
    const api = this.forRole(role);
    const { status } = await api.rooms.unarchiveRoom(roomId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(api.operations);
    return { status, operation };
  }

  async deleteRoom(role: Role, roomId: number) {
    const api = this.forRole(role);
    const { status } = await api.rooms.deleteRoom(roomId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(api.operations);
    return { status, operation };
  }

  async waitForRoomTemplateReady(role: Role) {
    const api = this.forRole(role);
    return waitForRoomTemplate(api.rooms);
  }

  async addMember(creatorRole: Role, type: UserType): Promise<AddMemberResult> {
    const fakeUser = this.faker.generateUser();
    const userData = { ...fakeUser, type };

    const credentialRole = USER_TYPE_TO_ROLE[type];
    this.tokenStore.setCredentials(
      credentialRole,
      fakeUser.email,
      fakeUser.password,
    );

    // Guests are created via a different endpoint
    const endpoint = type === "Guest" ? "people/active" : "people";
    const response = await this.request.post(
      `https://${this.tokenStore.portalDomain}/api/2.0/${endpoint}`,
      {
        headers: {
          Authorization: `Bearer ${this.tokenStore.getToken(creatorRole)}`,
        },
        data: userData,
      },
    );
    const data = await response.json();
    return { data, status: response.status(), userData: fakeUser };
  }
}
