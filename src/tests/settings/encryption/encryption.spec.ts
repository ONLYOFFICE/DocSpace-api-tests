// EncryptionApi methods are not automated because Storage Encryption is a feature
// available only in DocSpace Enterprise/Server (on-premise) installations.
// The test environment uses the cloud version (onlyoffice.io) where these endpoints
// are unavailable. To cover these methods, a dedicated server installation is required.
//
// Methods not covered:
//   getStorageEncryptionProgress  GET  /api/2.0/settings/encryption/progress
//   getStorageEncryptionSettings  GET  /api/2.0/settings/encryption
//   startStorageEncryption        POST /api/2.0/settings/encryption/start
