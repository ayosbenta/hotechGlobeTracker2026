export interface ScriptProperties {
  getProperty(key: string): string | null;
}

export interface ServerConfig {
  spreadsheetId: string;
  allowedOrigins: readonly string[];
}

export class ConfigurationError extends Error {
  constructor() {
    super("Server configuration is unavailable.");
    this.name = "ConfigurationError";
  }
}

function parseAllowedOrigins(raw: string | null): readonly string[] {
  if (raw === null || raw.trim() === "") return [];

  const origins = raw.split(",").map((origin) => origin.trim());
  if (
    origins.some((origin) => !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))
  ) {
    throw new ConfigurationError();
  }
  return origins;
}

export function loadServerConfig(properties: ScriptProperties): ServerConfig {
  const spreadsheetId = properties.getProperty("SPREADSHEET_ID")?.trim();
  if (!spreadsheetId || !/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) {
    throw new ConfigurationError();
  }

  return {
    spreadsheetId,
    allowedOrigins: parseAllowedOrigins(
      properties.getProperty("ALLOWED_ORIGINS"),
    ),
  };
}

/**
 * Defense-in-depth helper only. Apps Script web-app events do not provide a
 * dependable request-header boundary, so it is not used as authentication.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return origin !== undefined && allowedOrigins.includes(origin);
}
