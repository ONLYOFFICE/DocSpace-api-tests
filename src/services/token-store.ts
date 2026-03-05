export type Role = "owner" | "docSpaceAdmin" | "roomAdmin" | "user" | "guest";

export class TokenStore {
  private tokens: Record<Role, string> = {
    owner: "",
    docSpaceAdmin: "",
    roomAdmin: "",
    user: "",
    guest: "",
  };

  portalDomain: string = "";
  isLocal: boolean = false;

  get portalBaseUrl(): string {
    const scheme = this.isLocal ? "http" : "https";
    return `${scheme}://${this.portalDomain}`;
  }

  getToken(role: Role): string {
    return this.tokens[role];
  }

  setToken(role: Role, token: string): void {
    this.tokens[role] = token;
  }
}
