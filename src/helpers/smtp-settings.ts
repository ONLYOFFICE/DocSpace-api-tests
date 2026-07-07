import config from "@/config";

export const smtpSettingsDto = {
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  senderAddress: config.SMTP_HOST_LOGIN,
  senderDisplayName: "DocSpace Autotest",
  credentialsUserName: config.SMTP_HOST_LOGIN,
  credentialsUserPassword: config.SMTP_HOST_PASSWORD,
  enableSSL: true,
  enableAuth: true,
  useNtlm: false,
  isDefaultSettings: false,
};
