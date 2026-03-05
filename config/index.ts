import dotenv from "dotenv";
import process from "node:process";

dotenv.config();

interface Config {
  PORTAL_REGISTRATION_URL: string;
  DOCSPACE_OWNER_EMAIL: string;
  DOCSPACE_OWNER_PASSWORD: string;
  MACHINEKEY: string;
  PKEY: string;
  LOCAL_PORTAL_DOMAIN: string;
}

const config: Config = {
  PORTAL_REGISTRATION_URL:
    process.env.PORTAL_REGISTRATION_URL ??
    "https://onlyoffice.io/apisystem/portal",
  DOCSPACE_OWNER_EMAIL:
    process.env.DOCSPACE_OWNER_EMAIL ?? "integration-test-email@gmail.com",
  DOCSPACE_OWNER_PASSWORD: process.env.DOCSPACE_OWNER_PASSWORD ?? "test1234",
  MACHINEKEY: process.env.MACHINEKEY ?? "",
  PKEY: process.env.PKEY ?? "",
  LOCAL_PORTAL_DOMAIN: process.env.LOCAL_PORTAL_DOMAIN ?? "",
};

export default config;
