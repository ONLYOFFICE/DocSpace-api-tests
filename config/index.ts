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
  NEXTCLOUD_URL: string;
  NEXTCLOUD_LOGIN: string;
  NEXTCLOUD_PASSWORD: string;
  DEEPSEEK_API_KEY: string;
  XAI_API_KEY: string;
  GOOGLE_AI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  TOGETHER_AI_API_KEY: string;
  EXA_API_KEY: string;
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
  NEXTCLOUD_URL: process.env.NEXTCLOUD_URL ?? "",
  NEXTCLOUD_LOGIN: process.env.NEXTCLOUD_LOGIN ?? "",
  NEXTCLOUD_PASSWORD: process.env.NEXTCLOUD_PASSWORD ?? "",
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? "",
  XAI_API_KEY: process.env.XAI_API_KEY ?? "",
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ?? "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  TOGETHER_AI_API_KEY: process.env.TOGETHER_AI_API_KEY ?? "",
  EXA_API_KEY: process.env.EXA_API_KEY ?? "",
};

export default config;
