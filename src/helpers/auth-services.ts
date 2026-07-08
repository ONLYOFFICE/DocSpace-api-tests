import config from "@/config";

export const s3AuthServiceDto = {
  name: "s3",
  props: [
    { name: "acesskey", value: config.S3_ACCESS_KEY },
    { name: "secretaccesskey", value: config.S3_SECRET_KEY },
  ],
};

export const invalidMysqlSettings = {
  databaseType: "mysql",
  dbHost: "invalid-host",
  dbPort: 3306,
  dbName: "testdb",
  dbUser: "user",
  dbPassword: "password",
  dbSsl: false,
};
