import type { WeekRange } from "@/components/dashboard/WeekSelector";
import type { DashboardCacheData } from "@/hooks/useDashboardCache";
import { buildDashboardCardExports, type ExcelColumn } from "@/lib/dashboardCardExports";
import { formatWeekRangeLabel } from "@/lib/weekRangeLabel";

type CellValue = string | number | null | undefined;

export type ExcelRow = Record<string, CellValue>;

interface SheetSpec {
  name: string;
  unit: string;
  columns: ExcelColumn[];
  rows: ExcelRow[];
}

interface WorkbookContext {
  documentTitle: string;
  selectedRange: WeekRange;
  generatedAt: string;
}

interface WorkbookSpec extends WorkbookContext {
  sheets: SheetSpec[];
}

interface DashboardWorkbookInput {
  selectedRange: WeekRange;
  generatedAt: string;
  data: DashboardCacheData;
}

interface CardWorkbookInput {
  title: string;
  selectedRange: WeekRange;
  generatedAt: string;
  unit: string;
  columns: ExcelColumn[];
  rows: ExcelRow[];
  sheetName?: string;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatIsoTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function sanitizeFilenamePart(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .trim()
    .replace(/\s+/g, "-");

  return normalized.length > 0 ? normalized : "dashboard-card";
}

function truncateSheetName(name: string): string {
  const trimmed = name.trim() || "Sheet1";
  return trimmed.slice(0, 31);
}

function toColumnName(index: number): string {
  let current = index + 1;
  let name = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function getCellRef(rowIndex: number, columnIndex: number): string {
  return `${toColumnName(columnIndex)}${rowIndex + 1}`;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  return table;
}

const CRC32_TABLE = createCrc32Table();

function crc32(data: Uint8Array): number {
  let value = 0xffffffff;

  for (const byte of data) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function writeUint16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosTime, dosDate };
}

function createZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const now = getDosDateTime(new Date());

  for (const entry of entries) {
    const fileName = encodeUtf8(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    const localHeader = new Uint8Array(30 + fileName.length);
    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20);
    writeUint16LE(localHeader, 6, 0x0800);
    writeUint16LE(localHeader, 8, 0);
    writeUint16LE(localHeader, 10, now.dosTime);
    writeUint16LE(localHeader, 12, now.dosDate);
    writeUint32LE(localHeader, 14, checksum);
    writeUint32LE(localHeader, 18, data.length);
    writeUint32LE(localHeader, 22, data.length);
    writeUint16LE(localHeader, 26, fileName.length);
    writeUint16LE(localHeader, 28, 0);
    localHeader.set(fileName, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + fileName.length);
    writeUint32LE(centralHeader, 0, 0x02014b50);
    writeUint16LE(centralHeader, 4, 20);
    writeUint16LE(centralHeader, 6, 20);
    writeUint16LE(centralHeader, 8, 0x0800);
    writeUint16LE(centralHeader, 10, 0);
    writeUint16LE(centralHeader, 12, now.dosTime);
    writeUint16LE(centralHeader, 14, now.dosDate);
    writeUint32LE(centralHeader, 16, checksum);
    writeUint32LE(centralHeader, 20, data.length);
    writeUint32LE(centralHeader, 24, data.length);
    writeUint16LE(centralHeader, 28, fileName.length);
    writeUint16LE(centralHeader, 30, 0);
    writeUint16LE(centralHeader, 32, 0);
    writeUint16LE(centralHeader, 34, 0);
    writeUint16LE(centralHeader, 36, 0);
    writeUint32LE(centralHeader, 38, 0);
    writeUint32LE(centralHeader, 42, offset);
    centralHeader.set(fileName, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirectory = joinBytes(centralParts);
  const localDirectory = joinBytes(localParts);
  const endRecord = new Uint8Array(22);
  writeUint32LE(endRecord, 0, 0x06054b50);
  writeUint16LE(endRecord, 4, 0);
  writeUint16LE(endRecord, 6, 0);
  writeUint16LE(endRecord, 8, entries.length);
  writeUint16LE(endRecord, 10, entries.length);
  writeUint32LE(endRecord, 12, centralDirectory.length);
  writeUint32LE(endRecord, 16, localDirectory.length);
  writeUint16LE(endRecord, 20, 0);

  return joinBytes([localDirectory, centralDirectory, endRecord]);
}

function createCellXml(value: CellValue, rowIndex: number, columnIndex: number, styleId = 0): string {
  const ref = getCellRef(rowIndex, columnIndex);

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${styleId}"><v>${value}</v></c>`;
  }

  const text = value == null ? "" : String(value);
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    text
  )}</t></is></c>`;
}

function buildSheetRows(context: WorkbookContext, sheet: SheetSpec): CellValue[][] {
  const sheetRows = sheet.rows.map((row) => sheet.columns.map((column) => row[column.key]));

  return [
    ["Selected Week", formatWeekRangeLabel(context.selectedRange)],
    ["Date Range", `${context.selectedRange.start} ~ ${context.selectedRange.end}`],
    ["Generated At", formatIsoTimestamp(context.generatedAt)],
    ["Metric Unit", sheet.unit],
    [],
    sheet.columns.map((column) => column.header),
    ...sheetRows,
  ];
}

function createWorksheetXml(context: WorkbookContext, sheet: SheetSpec): string {
  const rows = buildSheetRows(context, sheet);
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnWidths = Array.from({ length: maxColumns }, (_, columnIndex) => {
    const maxWidth = rows.reduce((currentMax, row) => {
      const cell = row[columnIndex];
      const length = cell == null ? 0 : String(cell).length;
      return Math.max(currentMax, length);
    }, 10);

    return Math.min(Math.max(maxWidth + 2, 12), 40);
  });

  const colsXml = columnWidths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
    )
    .join("");

  const rowsXml = rows
    .map((row, rowIndex) => {
      const isHeaderRow = rowIndex === 5;
      const cellsXml = row
        .map((cell, columnIndex) => {
          const isMetaLabel = rowIndex < 4 && columnIndex === 0;
          const styleId = isHeaderRow || isMetaLabel ? 1 : 0;
          return createCellXml(cell, rowIndex, columnIndex, styleId);
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    })
    .join("");

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${colsXml}</cols><sheetData>${rowsXml}</sheetData></worksheet>`;
}

function createWorkbookXml(sheetNames: string[]): string {
  const sheetsXml = sheetNames
    .map(
      (sheetName, index) =>
        `<sheet name="${escapeXml(sheetName)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join("");

  return `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`;
}

function createWorkbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) => {
    return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
  }).join("");

  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function createRootRelsXml(): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function createContentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) => {
    return `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join("");

  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetOverrides}</Types>`;
}

function createStylesXml(): string {
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
}

function createCoreXml(documentTitle: string, generatedAt: string): string {
  const iso = new Date(generatedAt).toISOString();
  return `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(
    documentTitle
  )}</dc:title><dc:creator>report-orchestrator</dc:creator><cp:lastModifiedBy>report-orchestrator</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
}

function createAppXml(sheetNames: string[]): string {
  return `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>report-orchestrator</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames
    .map((sheetName) => `<vt:lpstr>${escapeXml(sheetName)}</vt:lpstr>`)
    .join("")}</vt:vector></TitlesOfParts></Properties>`;
}

function createWorkbookBlob(workbook: WorkbookSpec): Blob {
  const sheetNames = workbook.sheets.map((sheet) => sheet.name);
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encodeUtf8(createContentTypesXml(workbook.sheets.length)) },
    { name: "_rels/.rels", data: encodeUtf8(createRootRelsXml()) },
    {
      name: "docProps/core.xml",
      data: encodeUtf8(createCoreXml(workbook.documentTitle, workbook.generatedAt)),
    },
    { name: "docProps/app.xml", data: encodeUtf8(createAppXml(sheetNames)) },
    { name: "xl/workbook.xml", data: encodeUtf8(createWorkbookXml(sheetNames)) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: encodeUtf8(createWorkbookRelsXml(workbook.sheets.length)),
    },
    { name: "xl/styles.xml", data: encodeUtf8(createStylesXml()) },
    ...workbook.sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encodeUtf8(createWorksheetXml(workbook, sheet)),
    })),
  ];

  const zip = createZip(entries);

  return new Blob([zip as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildDashboardWorkbook(input: DashboardWorkbookInput): WorkbookSpec {
  const cards = buildDashboardCardExports(input.data);

  return {
    documentTitle: `Dashboard Export ${formatWeekRangeLabel(input.selectedRange)}`,
    selectedRange: input.selectedRange,
    generatedAt: input.generatedAt,
    sheets: [
      cards.totalSessions,
      cards.totalInstalls,
      cards.avgEngagementRate,
      cards.channelShare,
      cards.trend,
      cards.channelRevenue,
      cards.conversionByChannel,
      cards.campaignInstalls,
      cards.installFunnel,
      cards.retention,
    ].map((sheet) => ({
      ...sheet,
      name: truncateSheetName(sheet.title),
    })),
  };
}

export function buildDashboardCardExcelFilename(title: string, selectedRange: WeekRange): string {
  return `${sanitizeFilenamePart(title)}_${selectedRange.start}_${selectedRange.end}.xlsx`;
}

export function downloadDashboardCardExcel(
  input: CardWorkbookInput,
  filename = buildDashboardCardExcelFilename(input.title, input.selectedRange)
): void {
  const workbook: WorkbookSpec = {
    documentTitle: `${input.title} Export`,
    selectedRange: input.selectedRange,
    generatedAt: input.generatedAt,
    sheets: [
      {
        name: truncateSheetName(input.sheetName ?? input.title),
        unit: input.unit,
        columns: input.columns,
        rows: input.rows,
      },
    ],
  };

  downloadBlob(createWorkbookBlob(workbook), filename);
}

export function downloadDashboardExcel(input: DashboardWorkbookInput, filename: string): void {
  downloadBlob(createWorkbookBlob(buildDashboardWorkbook(input)), filename);
}
