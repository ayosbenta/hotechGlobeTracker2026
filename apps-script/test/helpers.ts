import type { Spreadsheet, SpreadsheetSheet, SheetRange } from "../core/schema";

export class FixedClock {
  constructor(private readonly value = new Date("2026-09-14T00:00:00.000Z")) {}

  now(): Date {
    return this.value;
  }
}

export class SequenceUuid {
  private index = 0;

  generate(): string {
    this.index += 1;
    return `uuid-${this.index}`;
  }
}

class MemoryRange implements SheetRange {
  constructor(
    private readonly sheet: MemorySheet,
    private readonly row: number,
    private readonly column: number,
    private readonly rowCount: number,
    private readonly columnCount: number,
  ) {}

  getValues(): unknown[][] {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.valueAt(this.row + rowOffset, this.column + columnOffset),
      ),
    );
  }

  setValues(values: readonly (readonly unknown[])[]): void {
    values.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        this.sheet.setValue(
          this.row + rowOffset,
          this.column + columnOffset,
          value,
        );
      });
    });
  }
}

export class MemorySheet implements SpreadsheetSheet {
  readonly rows: unknown[][] = [];

  getLastRow(): number {
    return this.rows.length;
  }

  getLastColumn(): number {
    return this.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  }

  getRange(
    row: number,
    column: number,
    rows: number,
    columns: number,
  ): SheetRange {
    return new MemoryRange(this, row, column, rows, columns);
  }

  appendRow(values: readonly unknown[]): void {
    this.rows.push([...values]);
  }

  valueAt(row: number, column: number): unknown {
    return this.rows[row - 1]?.[column - 1] ?? "";
  }

  setValue(row: number, column: number, value: unknown): void {
    while (this.rows.length < row) this.rows.push([]);
    this.rows[row - 1][column - 1] = value;
  }
}

export class MemorySpreadsheet implements Spreadsheet {
  readonly sheets = new Map<string, MemorySheet>();

  getSheetByName(name: string): MemorySheet | null {
    return this.sheets.get(name) ?? null;
  }

  insertSheet(name: string): MemorySheet {
    const sheet = new MemorySheet();
    this.sheets.set(name, sheet);
    return sheet;
  }
}
