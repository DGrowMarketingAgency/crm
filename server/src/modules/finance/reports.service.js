import ExcelJS from 'exceljs';
import { pool } from '../../config/db.js';
import { sanitizeCellValue } from '../reports/reports.export.js';
import { round2 } from './gst.js';

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const sum = (rows, k) => round2(rows.reduce((a, r) => a + Number(r[k] || 0), 0));
const ISSUED = "i.status IN ('issued','partially_paid','paid','overdue','void')";

/** Default range: the current month to date. */
function range({ from, to }) {
  const today = new Date().toISOString().slice(0, 10);
  return [from || `${today.slice(0, 7)}-01`, to || today];
}

export class FinanceReportsService {
  /** Every issued invoice in the range (cancelled ones listed but left out of totals). */
  static async salesRegister(q) {
    const [from, to] = range(q);
    const params = [from, to];
    let typeSql = '';
    if (q.type) {
      typeSql = 'AND i.invoice_type = ?';
      params.push(q.type);
    }
    const [rows] = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.invoice_type, i.status, i.place_of_supply, i.place_state_code, i.supply_type,
              COALESCE(c.company_name, c.name) AS client_name, c.gstin AS client_gstin,
              i.taxable_amount, i.cgst_amount, i.sgst_amount, i.igst_amount, i.round_off, i.total_amount, i.amount_paid, i.outstanding_balance
       FROM invoices i JOIN clients c ON c.id = i.client_id
       WHERE ${ISSUED} AND i.invoice_type IS NOT NULL AND i.invoice_date BETWEEN ? AND ? ${typeSql}
       ORDER BY i.invoice_date, i.invoice_number`,
      params
    );
    const live = rows.filter((r) => r.status !== 'void');
    return {
      range: { from, to },
      rows: rows.map((r) => ({ ...r, invoice_date: iso(r.invoice_date), cancelled: r.status === 'void' })),
      totals: {
        count: live.length,
        cancelled: rows.length - live.length,
        taxable: sum(live, 'taxable_amount'),
        cgst: sum(live, 'cgst_amount'),
        sgst: sum(live, 'sgst_amount'),
        igst: sum(live, 'igst_amount'),
        total: sum(live, 'total_amount'),
        paid: sum(live, 'amount_paid'),
        outstanding: sum(live, 'outstanding_balance')
      }
    };
  }

  /**
   * GST return summary for the period: B2B invoice-wise (client has a GSTIN), B2C grouped by place of supply and rate,
   * SAC-wise summary, non-GST (IND) supplies, credit notes issued, and the net tax liability.
   */
  static async gstSummary(q) {
    const [from, to] = range(q);
    const [inv] = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.invoice_type, i.place_of_supply, i.place_state_code, i.supply_type,
              COALESCE(c.company_name, c.name) AS client_name, c.gstin AS client_gstin,
              i.taxable_amount, i.cgst_amount, i.sgst_amount, i.igst_amount, i.total_amount
       FROM invoices i JOIN clients c ON c.id = i.client_id
       WHERE i.status IN ('issued','partially_paid','paid','overdue') AND i.invoice_type IS NOT NULL AND i.invoice_date BETWEEN ? AND ?
       ORDER BY i.invoice_date, i.invoice_number`,
      [from, to]
    );
    const taxed = inv.filter((r) => r.invoice_type !== 'IND');
    const b2b = taxed.filter((r) => r.client_gstin).map((r) => ({ ...r, invoice_date: iso(r.invoice_date) }));
    const b2cMap = new Map();
    const [b2cLines] = await pool.query(
      `SELECT i.place_of_supply, i.place_state_code, ii.tax_rate, SUM(ii.taxable_amount) AS taxable,
              SUM(ii.cgst_amount) AS cgst, SUM(ii.sgst_amount) AS sgst, SUM(ii.igst_amount) AS igst, COUNT(DISTINCT i.id) AS invoices
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id JOIN clients c ON c.id = i.client_id
       WHERE i.status IN ('issued','partially_paid','paid','overdue') AND i.invoice_type IN ('INV','INC')
         AND (c.gstin IS NULL OR c.gstin = '') AND i.invoice_date BETWEEN ? AND ?
       GROUP BY i.place_of_supply, i.place_state_code, ii.tax_rate ORDER BY i.place_of_supply, ii.tax_rate`,
      [from, to]
    );
    for (const r of b2cLines) b2cMap.set(`${r.place_state_code}-${r.tax_rate}`, r);
    const [sac] = await pool.query(
      `SELECT COALESCE(NULLIF(ii.sac_code, ''), '—') AS sac_code, ii.tax_rate, SUM(ii.quantity) AS quantity, SUM(ii.taxable_amount) AS taxable,
              SUM(ii.cgst_amount) AS cgst, SUM(ii.sgst_amount) AS sgst, SUM(ii.igst_amount) AS igst
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.status IN ('issued','partially_paid','paid','overdue') AND i.invoice_type IN ('INV','INC') AND i.invoice_date BETWEEN ? AND ?
       GROUP BY 1, ii.tax_rate ORDER BY 1, ii.tax_rate`,
      [from, to]
    );
    const [credit] = await pool.query(
      `SELECT cn.credit_note_number, cn.note_date, cn.reason, i.invoice_number, COALESCE(c.company_name, c.name) AS client_name,
              cn.taxable_amount, cn.cgst_amount, cn.sgst_amount, cn.igst_amount, cn.total_amount
       FROM credit_notes cn JOIN invoices i ON i.id = cn.invoice_id JOIN clients c ON c.id = cn.client_id
       WHERE cn.note_date BETWEEN ? AND ? ORDER BY cn.note_date`,
      [from, to]
    );
    const num = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ['taxable', 'cgst', 'sgst', 'igst', 'quantity', 'invoices'].includes(k) ? Number(v) : v])));
    const out = {
      taxable: sum(taxed, 'taxable_amount'), cgst: sum(taxed, 'cgst_amount'), sgst: sum(taxed, 'sgst_amount'), igst: sum(taxed, 'igst_amount')
    };
    const cn = { taxable: sum(credit, 'taxable_amount'), cgst: sum(credit, 'cgst_amount'), sgst: sum(credit, 'sgst_amount'), igst: sum(credit, 'igst_amount') };
    return {
      range: { from, to },
      b2b,
      b2c: num([...b2cMap.values()]),
      sac: num(sac),
      nonGst: { count: inv.length - taxed.length, value: sum(inv.filter((r) => r.invoice_type === 'IND'), 'total_amount') },
      creditNotes: credit.map((r) => ({ ...r, note_date: iso(r.note_date) })),
      totals: {
        outward: out,
        creditNotes: cn,
        net: { taxable: round2(out.taxable - cn.taxable), cgst: round2(out.cgst - cn.cgst), sgst: round2(out.sgst - cn.sgst), igst: round2(out.igst - cn.igst),
          tax: round2(out.cgst + out.sgst + out.igst - cn.cgst - cn.sgst - cn.igst) }
      }
    };
  }

  /** Unpaid balances by age past the due date, as of a date (default today). */
  static async aging(q) {
    const asOf = q.asOf || new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_type, i.invoice_date, i.due_date, i.total_amount, i.amount_paid, i.outstanding_balance,
              c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name, am.name AS account_manager,
              DATEDIFF(?, i.due_date) AS days_overdue
       FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN users am ON am.id = c.account_manager_id
       WHERE i.status IN ('issued','partially_paid','overdue') AND i.outstanding_balance > 0 AND i.invoice_date <= ?
       ORDER BY days_overdue DESC`,
      [asOf, asOf]
    );
    const bucket = (d) => (d <= 0 ? 'current' : d <= 30 ? 'd30' : d <= 60 ? 'd60' : d <= 90 ? 'd90' : 'd90plus');
    const clients = new Map();
    const totals = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
    const invoices = rows.map((r) => {
      const b = bucket(Number(r.days_overdue));
      const bal = Number(r.outstanding_balance);
      totals[b] = round2(totals[b] + bal);
      totals.total = round2(totals.total + bal);
      const c = clients.get(r.client_id) || { client_id: r.client_id, client_name: r.client_name, account_manager: r.account_manager, current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0, invoices: 0, oldest_days: 0 };
      c[b] = round2(c[b] + bal);
      c.total = round2(c.total + bal);
      c.invoices += 1;
      c.oldest_days = Math.max(c.oldest_days, Number(r.days_overdue));
      clients.set(r.client_id, c);
      return { ...r, invoice_date: iso(r.invoice_date), due_date: iso(r.due_date), days_overdue: Number(r.days_overdue), bucket: b };
    });
    return { asOf, totals, clients: [...clients.values()].sort((a, b) => b.total - a.total), invoices };
  }

  static async paymentsReceived(q) {
    const [from, to] = range(q);
    const [rows] = await pool.query(
      `SELECT p.payment_reference, p.payment_date, p.amount, p.payment_method, p.transaction_reference, i.invoice_number,
              COALESCE(c.company_name, c.name) AS client_name, u.name AS recorded_by
       FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.payment_status = 'completed' AND p.payment_date BETWEEN ? AND ? ORDER BY p.payment_date, p.id`,
      [from, to]
    );
    const byMode = {};
    for (const r of rows) byMode[r.payment_method] = round2((byMode[r.payment_method] || 0) + Number(r.amount));
    return { range: { from, to }, rows: rows.map((r) => ({ ...r, payment_date: iso(r.payment_date), amount: Number(r.amount) })), totals: { count: rows.length, amount: sum(rows, 'amount'), byMode } };
  }

  // ───────────────────────── Excel export ─────────────────────────

  static async toWorkbook(report, q) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'D-GROW CRM';
    const add = (name, columns, rows) => {
      const ws = wb.addWorksheet(name.slice(0, 31));
      ws.columns = columns.map(([header, key, width = 16, money]) => ({ header, key, width, style: money ? { numFmt: '#,##0.00' } : {} }));
      ws.getRow(1).font = { bold: true };
      for (const r of rows) ws.addRow(Object.fromEntries(columns.map(([, key]) => [key, sanitizeCellValue(r[key])])));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };
    const M = true;
    if (report === 'sales-register') {
      const d = await this.salesRegister(q);
      add('Sales register', [['Invoice', 'invoice_number', 14], ['Date', 'invoice_date', 12], ['Type', 'invoice_type', 6], ['Client', 'client_name', 30], ['GSTIN', 'client_gstin', 18],
        ['Place of supply', 'place_of_supply', 18], ['Taxable', 'taxable_amount', 14, M], ['CGST', 'cgst_amount', 12, M], ['SGST', 'sgst_amount', 12, M], ['IGST', 'igst_amount', 12, M],
        ['Total', 'total_amount', 14, M], ['Paid', 'amount_paid', 14, M], ['Balance', 'outstanding_balance', 14, M], ['Status', 'status', 12]], d.rows);
    } else if (report === 'gst-summary') {
      const d = await this.gstSummary(q);
      add('B2B', [['Invoice', 'invoice_number', 14], ['Date', 'invoice_date', 12], ['Client', 'client_name', 30], ['GSTIN', 'client_gstin', 18], ['Place', 'place_of_supply', 18],
        ['Taxable', 'taxable_amount', 14, M], ['CGST', 'cgst_amount', 12, M], ['SGST', 'sgst_amount', 12, M], ['IGST', 'igst_amount', 12, M], ['Total', 'total_amount', 14, M]], d.b2b);
      add('B2C', [['Place of supply', 'place_of_supply', 20], ['State code', 'place_state_code', 10], ['GST %', 'tax_rate', 8], ['Invoices', 'invoices', 10],
        ['Taxable', 'taxable', 14, M], ['CGST', 'cgst', 12, M], ['SGST', 'sgst', 12, M], ['IGST', 'igst', 12, M]], d.b2c);
      add('SAC summary', [['SAC', 'sac_code', 10], ['GST %', 'tax_rate', 8], ['Qty', 'quantity', 8], ['Taxable', 'taxable', 14, M], ['CGST', 'cgst', 12, M], ['SGST', 'sgst', 12, M], ['IGST', 'igst', 12, M]], d.sac);
      add('Credit notes', [['Credit note', 'credit_note_number', 14], ['Date', 'note_date', 12], ['Against invoice', 'invoice_number', 14], ['Client', 'client_name', 30],
        ['Taxable', 'taxable_amount', 14, M], ['CGST', 'cgst_amount', 12, M], ['SGST', 'sgst_amount', 12, M], ['IGST', 'igst_amount', 12, M], ['Reason', 'reason', 30]], d.creditNotes);
    } else if (report === 'aging') {
      const d = await this.aging(q);
      add('By client', [['Client', 'client_name', 30], ['Account manager', 'account_manager', 20], ['Not due', 'current', 12, M], ['1-30 days', 'd30', 12, M], ['31-60', 'd60', 12, M],
        ['61-90', 'd90', 12, M], ['90+', 'd90plus', 12, M], ['Total', 'total', 14, M]], d.clients);
      add('Invoices', [['Invoice', 'invoice_number', 14], ['Client', 'client_name', 30], ['Due', 'due_date', 12], ['Days overdue', 'days_overdue', 12], ['Total', 'total_amount', 14, M],
        ['Paid', 'amount_paid', 14, M], ['Balance', 'outstanding_balance', 14, M]], d.invoices);
    } else if (report === 'payments') {
      const d = await this.paymentsReceived(q);
      add('Payments', [['Date', 'payment_date', 12], ['Reference', 'payment_reference', 18], ['Invoice', 'invoice_number', 14], ['Client', 'client_name', 30], ['Amount', 'amount', 14, M],
        ['Mode', 'payment_method', 14], ['UTR / ref', 'transaction_reference', 20], ['Recorded by', 'recorded_by', 18]], d.rows);
    } else {
      const e = new Error('Unknown report');
      e.status = 400;
      throw e;
    }
    return wb;
  }
}
