// LicenseApi methods are not automated because license management is a feature
// available only in DocSpace Enterprise/Server (on-premise) installations.
// The test environment uses the cloud version (onlyoffice.io) where these endpoints
// are unavailable. To cover these methods, a dedicated server installation is required.
//
// Methods not covered:
//   acceptLicense         POST  /api/2.0/settings/license/accept
//   getIsLicenseRequired  GET   /api/2.0/settings/license/required
//   refreshLicense        GET   /api/2.0/settings/license/refresh
//   uploadLicense         POST  /api/2.0/settings/license
