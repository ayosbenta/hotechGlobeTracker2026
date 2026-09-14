import type { ServerConfig } from "./config";
import type { SheetName, Spreadsheet, SpreadsheetSheet } from "./schema";

export interface SpreadsheetGateway {
  openById(id: string): Spreadsheet;
}

/**
 * Typed Sheet access adapter. Phase 02 deliberately exposes no CRUD methods;
 * future repositories must use UUIDs and header names, never row identities.
 */
export class SheetRepository {
  constructor(private readonly spreadsheet: Spreadsheet) {}

  requiredSheet(name: SheetName): SpreadsheetSheet {
    const sheet = this.spreadsheet.getSheetByName(name);
    if (sheet === null)
      throw new Error(`Required sheet is unavailable: ${name}`);
    return sheet;
  }
}

export function openSheetRepository(
  gateway: SpreadsheetGateway,
  config: ServerConfig,
): SheetRepository {
  return new SheetRepository(gateway.openById(config.spreadsheetId));
}
