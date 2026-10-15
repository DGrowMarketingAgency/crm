import ExcelJS from 'exceljs';

/**
 * Sanitizes values against CSV/Spreadsheet Formula Injection (CWE-1236)
 * Prepending a single quote (') if the text starts with formula triggers: =, +, -, @, \t, \r
 */
export function sanitizeCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) return val.toISOString();
  
  const str = String(val);
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some((p) => str.startsWith(p))) {
    return `'${str}`;
  }
  return str;
}

/**
 * Generates an Excel XLSX buffer
 */
export async function generateXlsxReport({
  title,
  metadata = {},
  columns,
  data
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'D-GROW CRM';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(title.substring(0, 31));

  // Title Row
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFB91C1C' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;

  // Metadata Rows
  let currentRow = 2;
  if (Object.keys(metadata).length > 0) {
    for (const [key, value] of Object.entries(metadata)) {
      const metaRow = worksheet.getRow(currentRow);
      metaRow.getCell(1).value = `${key}:`;
      metaRow.getCell(1).font = { bold: true, color: { argb: 'FF475569' }, size: 10 };
      metaRow.getCell(2).value = sanitizeCellValue(value);
      metaRow.getCell(2).font = { color: { argb: 'FF1E293B' }, size: 10 };
      currentRow++;
    }
    currentRow++; // Empty spacing row
  }

  // Header Row
  const headerRow = worksheet.getRow(currentRow);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB91C1C' } // Brand red-700
    };
    cell.alignment = { vertical: 'middle', horizontal: col.align || 'left' };
  });
  headerRow.height = 24;
  currentRow++;

  // Data Rows
  data.forEach((item) => {
    const row = worksheet.getRow(currentRow);
    columns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);
      const rawVal = item[col.key];
      cell.value = sanitizeCellValue(rawVal);
      cell.alignment = { vertical: 'middle', horizontal: col.align || 'left' };
      if (col.numFmt) {
        cell.numFmt = col.numFmt;
      }
    });
    currentRow++;
  });

  // Adjust column widths automatically
  columns.forEach((col, idx) => {
    const column = worksheet.getColumn(idx + 1);
    let maxLen = (col.header || '').length;
    data.forEach((item) => {
      const len = String(item[col.key] || '').length;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 50);
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generates CSV string
 */
export function generateCsvReport({
  title,
  metadata = {},
  columns,
  data
}) {
  const lines = [];

  // Metadata headers
  lines.push(`"# ${title}"`);
  for (const [key, value] of Object.entries(metadata)) {
    lines.push(`"# ${key}: ${String(value).replace(/"/g, '""')}"`);
  }
  lines.push(''); // Blank line

  // Column Headers
  const headerLine = columns
    .map((col) => `"${String(col.header).replace(/"/g, '""')}"`)
    .join(',');
  lines.push(headerLine);

  // Data Rows
  data.forEach((item) => {
    const row = columns
      .map((col) => {
        const val = sanitizeCellValue(item[col.key]);
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',');
    lines.push(row);
  });

  return lines.join('\r\n');
}
