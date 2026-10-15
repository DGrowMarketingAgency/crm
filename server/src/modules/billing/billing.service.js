import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export class BillingService {
  /**
   * Safe decimal helper
   */
  static round2(val) {
    return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Concurrency-safe unique number generator
   */
  static async generateNumber(connection, table, column, prefix) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const random = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}-${yearMonth}-${random}`;

    const [existing] = await connection.query(
      `SELECT id FROM ${table} WHERE ${column} = ?`,
      [candidate]
    );

    if (existing.length > 0) {
      return this.generateNumber(connection, table, column, prefix);
    }
    return candidate;
  }

  // =========================================================================
  // 1. QUOTATION MANAGEMENT
  // =========================================================================

  /**
   * Create Quotation
   */
  static async createQuotation(actorUser, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const clientId = data.clientId;
      if (!clientId) {
        throw { status: 400, message: 'Client ID is required' };
      }

      const [clients] = await connection.query('SELECT id, name FROM clients WHERE id = ?', [clientId]);
      if (clients.length === 0) {
        throw { status: 404, message: 'Client not found' };
      }

      if (!data.title || !data.title.trim()) {
        throw { status: 400, message: 'Quotation title is required' };
      }
      if (!data.quotationDate) {
        throw { status: 400, message: 'Quotation date is required' };
      }
      if (!data.expiryDate) {
        throw { status: 400, message: 'Expiry date is required' };
      }

      const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : [];
      if (items.length === 0) {
        throw { status: 400, message: 'At least one line item is required' };
      }

      // Backend financial calculations with decimal-safe math
      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;

      const processedItems = items.map((item, index) => {
        const desc = item.description || item.item_description || `Item #${index + 1}`;
        const qty = Math.max(0.01, this.round2(item.quantity || 1));
        const unitPrice = Math.max(0, this.round2(item.unitPrice || item.unit_price || 0));
        const discountPct = Math.min(100, Math.max(0, this.round2(item.discountPercent || item.discount_percent || 0)));
        const taxRate = Math.max(0, this.round2(item.taxRate || item.tax_rate || 0));

        const itemBase = this.round2(qty * unitPrice);
        const itemDiscount = this.round2(itemBase * (discountPct / 100));
        const itemTaxable = this.round2(itemBase - itemDiscount);
        const itemTax = this.round2(itemTaxable * (taxRate / 100));
        const lineTotal = this.round2(itemTaxable + itemTax);

        subtotal = this.round2(subtotal + itemBase);
        totalDiscount = this.round2(totalDiscount + itemDiscount);
        totalTax = this.round2(totalTax + itemTax);

        return {
          item_description: desc,
          quantity: qty,
          unit_price: unitPrice,
          discount_percent: discountPct,
          tax_rate: taxRate,
          line_total: lineTotal,
          sort_order: index + 1
        };
      });

      const totalAmount = this.round2(subtotal - totalDiscount + totalTax);
      const quotationNumber = await this.generateNumber(connection, 'quotations', 'quotation_number', 'QUOT');

      const [quotationResult] = await connection.query(
        `INSERT INTO quotations 
          (quotation_number, version_number, client_id, project_id, service_id, prepared_by, title,
           status, quotation_date, expiry_date, currency, subtotal, discount_amount, tax_rate, tax_amount, total_amount, terms_and_conditions, notes)
         VALUES (?, 1, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationNumber,
          clientId,
          data.projectId || null,
          data.serviceId || null,
          actorUser.id,
          data.title.trim(),
          data.quotationDate,
          data.expiryDate,
          data.currency || 'INR',
          subtotal,
          totalDiscount,
          data.taxRate ? this.round2(data.taxRate) : 0,
          totalTax,
          totalAmount,
          data.termsAndConditions || null,
          data.notes || null
        ]
      );

      const quotationId = quotationResult.insertId;

      for (const item of processedItems) {
        await connection.query(
          `INSERT INTO quotation_items 
            (quotation_id, item_description, quantity, unit_price, discount_percent, tax_rate, line_total, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quotationId,
            item.item_description,
            item.quantity,
            item.unit_price,
            item.discount_percent,
            item.tax_rate,
            item.line_total,
            item.sort_order
          ]
        );
      }

      await connection.commit();

      await AuditService.log({
        userId: actorUser.id,
        action: 'QUOTATION_CREATED',
        entity: 'quotations',
        entityId: quotationId,
        details: { quotationNumber, totalAmount, clientId }
      });

      return this.getQuotationDetails(actorUser, quotationId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * List Quotations
   */
  static async listQuotations(actorUser, filters = {}) {
    const conditions = ['1=1'];
    const params = [];

    // Client isolation: Client users see ONLY their quotes
    if (actorUser.client_id) {
      conditions.push('q.client_id = ?');
      params.push(actorUser.client_id);
    } else if (filters.clientId) {
      conditions.push('q.client_id = ?');
      params.push(filters.clientId);
    }

    if (filters.status && filters.status !== 'all') {
      conditions.push('q.status = ?');
      params.push(filters.status);
    }

    if (filters.search) {
      conditions.push('(q.quotation_number LIKE ? OR q.title LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    const query = `
      SELECT 
        q.*,
        c.name AS client_name,
        c.company_name AS client_company_name,
        u_prep.name AS prepared_by_name,
        p.name AS project_name,
        s.label AS service_name
      FROM quotations q
      JOIN clients c ON q.client_id = c.id
      JOIN users u_prep ON q.prepared_by = u_prep.id
      LEFT JOIN projects p ON q.project_id = p.id
      LEFT JOIN service_instances s ON q.service_id = s.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY q.created_at DESC
    `;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Get Quotation Details
   */
  static async getQuotationDetails(actorUser, quotationId) {
    const [quotations] = await pool.query(
      `SELECT 
        q.*,
        c.name AS client_name,
        c.company_name AS client_company_name,
        c.address AS client_address,
        c.city AS client_city,
        c.gstin AS client_gstin,
        u_prep.name AS prepared_by_name,
        u_prep.email AS prepared_by_email,
        u_dec.name AS client_decision_by_name,
        p.name AS project_name,
        s.label AS service_name
      FROM quotations q
      JOIN clients c ON q.client_id = c.id
      JOIN users u_prep ON q.prepared_by = u_prep.id
      LEFT JOIN users u_dec ON q.client_decision_by = u_dec.id
      LEFT JOIN projects p ON q.project_id = p.id
      LEFT JOIN service_instances s ON q.service_id = s.id
      WHERE q.id = ?`,
      [quotationId]
    );

    if (quotations.length === 0) {
      throw { status: 404, message: 'Quotation not found' };
    }

    const quotation = quotations[0];

    // Client isolation check
    if (actorUser.client_id && Number(quotation.client_id) !== Number(actorUser.client_id)) {
      throw { status: 403, message: 'Access denied: You do not have permission to view this quotation' };
    }

    const [items] = await pool.query(
      'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, id ASC',
      [quotationId]
    );

    return {
      quotation,
      items
    };
  }

  /**
   * Issue Quotation to Client Portal
   */
  static async issueQuotation(actorUser, quotationId) {
    const { quotation } = await this.getQuotationDetails(actorUser, quotationId);

    if (quotation.status !== 'draft') {
      throw { status: 400, message: `Only draft quotations can be issued. Current status: ${quotation.status}` };
    }

    await pool.query(
      "UPDATE quotations SET status = 'sent', updated_at = NOW() WHERE id = ?",
      [quotationId]
    );

    await AuditService.log({
      userId: actorUser.id,
      action: 'QUOTATION_ISSUED',
      entity: 'quotations',
      entityId: quotationId,
      details: { quotationNumber: quotation.quotation_number, clientId: quotation.client_id }
    });

    // Notify client users
    const [clientUsers] = await pool.query(
      'SELECT id FROM users WHERE client_id = ?',
      [quotation.client_id]
    );
    for (const u of clientUsers) {
      await NotificationsService.createNotification({
        userId: u.id,
        title: 'New Quotation Received',
        message: `Quotation ${quotation.quotation_number} ("${quotation.title}") has been issued for your review.`,
        type: 'billing',
        entityType: 'quotation',
        entityId: quotationId
      });
    }

    return this.getQuotationDetails(actorUser, quotationId);
  }

  /**
   * Client Portal Quotation Decision (Accept or Reject)
   */
  static async clientReviewQuotation(actorUser, quotationId, { decision, rejectionReason }) {
    const { quotation } = await this.getQuotationDetails(actorUser, quotationId);

    // Client isolation check
    if (actorUser.client_id && Number(quotation.client_id) !== Number(actorUser.client_id)) {
      throw { status: 403, message: 'You can only review quotations issued to your organization' };
    }

    if (!['sent', 'viewed'].includes(quotation.status)) {
      throw { status: 400, message: `Quotation cannot be reviewed in current status: ${quotation.status}` };
    }

    // Expiry check
    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date(quotation.expiry_date).toISOString().split('T')[0];
    if (today > expiry) {
      await pool.query("UPDATE quotations SET status = 'expired' WHERE id = ?", [quotationId]);
      throw { status: 400, message: 'This quotation has expired and can no longer be accepted' };
    }

    if (decision === 'accept') {
      await pool.query(
        `UPDATE quotations 
         SET status = 'accepted', client_decision_by = ?, client_decision_at = NOW(), updated_at = NOW() 
         WHERE id = ?`,
        [actorUser.id, quotationId]
      );

      await NotificationsService.createNotification({
        userId: quotation.prepared_by,
        title: 'Quotation Accepted by Client!',
        message: `Client accepted quotation ${quotation.quotation_number} (${quotation.currency} ${quotation.total_amount}).`,
        type: 'billing',
        entityType: 'quotation',
        entityId: quotationId
      });
    } else if (decision === 'reject') {
      await pool.query(
        `UPDATE quotations 
         SET status = 'rejected', client_decision_by = ?, client_decision_at = NOW(), client_rejection_reason = ?, updated_at = NOW() 
         WHERE id = ?`,
        [actorUser.id, rejectionReason || 'No reason provided', quotationId]
      );

      await NotificationsService.createNotification({
        userId: quotation.prepared_by,
        title: 'Quotation Rejected',
        message: `Client rejected quotation ${quotation.quotation_number}. Reason: "${rejectionReason || 'None'}"`,
        type: 'billing',
        entityType: 'quotation',
        entityId: quotationId
      });
    } else {
      throw { status: 400, message: 'Invalid decision. Must be "accept" or "reject"' };
    }

    await AuditService.log({
      userId: actorUser.id,
      action: decision === 'accept' ? 'QUOTATION_ACCEPTED' : 'QUOTATION_REJECTED',
      entity: 'quotations',
      entityId: quotationId,
      details: { decision, rejectionReason }
    });

    return this.getQuotationDetails(actorUser, quotationId);
  }

  /**
   * Convert Accepted Quotation to Invoice
   */
  static async convertQuotationToInvoice(actorUser, quotationId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [quotations] = await connection.query(
        'SELECT * FROM quotations WHERE id = ? FOR UPDATE',
        [quotationId]
      );
      if (quotations.length === 0) {
        throw { status: 404, message: 'Quotation not found' };
      }
      const quotation = quotations[0];

      if (quotation.converted_invoice_id || quotation.status === 'converted') {
        throw { status: 400, message: 'This quotation has already been converted to an invoice' };
      }

      if (quotation.status !== 'accepted') {
        throw { status: 400, message: `Only accepted quotations can be converted to an invoice. Status is ${quotation.status}` };
      }

      const [items] = await connection.query(
        'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC',
        [quotationId]
      );

      const invoiceNumber = await this.generateNumber(connection, 'invoices', 'invoice_number', 'INV');
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]; // Default 15 days net

      const [invoiceResult] = await connection.query(
        `INSERT INTO invoices 
          (invoice_number, client_id, quotation_id, project_id, service_id, created_by,
           status, invoice_date, due_date, currency, subtotal, discount_amount, tax_rate, tax_amount,
           total_amount, amount_paid, outstanding_balance, payment_terms, notes, issued_at)
         VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, NOW())`,
        [
          invoiceNumber,
          quotation.client_id,
          quotation.id,
          quotation.project_id,
          quotation.service_id,
          actorUser.id,
          today,
          dueDate,
          quotation.currency,
          quotation.subtotal,
          quotation.discount_amount,
          quotation.tax_rate,
          quotation.tax_amount,
          quotation.total_amount,
          quotation.total_amount, // outstanding_balance initially equals total_amount
          quotation.terms_and_conditions || 'Payment due within 15 days',
          quotation.notes
        ]
      );

      const invoiceId = invoiceResult.insertId;

      for (const item of items) {
        await connection.query(
          `INSERT INTO invoice_items 
            (invoice_id, item_description, quantity, unit_price, discount_percent, tax_rate, line_total, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            item.item_description,
            item.quantity,
            item.unit_price,
            item.discount_percent,
            item.tax_rate,
            item.line_total,
            item.sort_order
          ]
        );
      }

      // Mark quotation converted and link invoice
      await connection.query(
        "UPDATE quotations SET status = 'converted', converted_invoice_id = ?, updated_at = NOW() WHERE id = ?",
        [invoiceId, quotationId]
      );

      await connection.commit();

      await AuditService.log({
        userId: actorUser.id,
        action: 'QUOTATION_CONVERTED_TO_INVOICE',
        entity: 'invoices',
        entityId: invoiceId,
        details: { quotationId, invoiceNumber }
      });

      return this.getInvoiceDetails(actorUser, invoiceId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  // =========================================================================
  // 2. INVOICE MANAGEMENT
  // =========================================================================

  /**
   * Create Standalone Invoice
   */
  static async createInvoice(actorUser, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const clientId = data.clientId;
      if (!clientId) {
        throw { status: 400, message: 'Client ID is required' };
      }

      const [clients] = await connection.query('SELECT id, name FROM clients WHERE id = ?', [clientId]);
      if (clients.length === 0) {
        throw { status: 404, message: 'Client not found' };
      }

      if (!data.invoiceDate) {
        throw { status: 400, message: 'Invoice date is required' };
      }
      if (!data.dueDate) {
        throw { status: 400, message: 'Due date is required' };
      }

      const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : [];
      if (items.length === 0) {
        throw { status: 400, message: 'At least one line item is required' };
      }

      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;

      const processedItems = items.map((item, index) => {
        const desc = item.description || item.item_description || `Item #${index + 1}`;
        const qty = Math.max(0.01, this.round2(item.quantity || 1));
        const unitPrice = Math.max(0, this.round2(item.unitPrice || item.unit_price || 0));
        const discountPct = Math.min(100, Math.max(0, this.round2(item.discountPercent || item.discount_percent || 0)));
        const taxRate = Math.max(0, this.round2(item.taxRate || item.tax_rate || 0));

        const itemBase = this.round2(qty * unitPrice);
        const itemDiscount = this.round2(itemBase * (discountPct / 100));
        const itemTaxable = this.round2(itemBase - itemDiscount);
        const itemTax = this.round2(itemTaxable * (taxRate / 100));
        const lineTotal = this.round2(itemTaxable + itemTax);

        subtotal = this.round2(subtotal + itemBase);
        totalDiscount = this.round2(totalDiscount + itemDiscount);
        totalTax = this.round2(totalTax + itemTax);

        return {
          item_description: desc,
          quantity: qty,
          unit_price: unitPrice,
          discount_percent: discountPct,
          tax_rate: taxRate,
          line_total: lineTotal,
          sort_order: index + 1
        };
      });

      const totalAmount = this.round2(subtotal - totalDiscount + totalTax);
      const invoiceNumber = await this.generateNumber(connection, 'invoices', 'invoice_number', 'INV');
      const status = data.status === 'issued' ? 'issued' : 'draft';

      const [invoiceResult] = await connection.query(
        `INSERT INTO invoices 
          (invoice_number, client_id, quotation_id, project_id, service_id, created_by,
           status, invoice_date, due_date, currency, subtotal, discount_amount, tax_rate, tax_amount,
           total_amount, amount_paid, outstanding_balance, payment_terms, notes, issued_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          clientId,
          data.projectId || null,
          data.serviceId || null,
          actorUser.id,
          status,
          data.invoiceDate,
          data.dueDate,
          data.currency || 'INR',
          subtotal,
          totalDiscount,
          data.taxRate ? this.round2(data.taxRate) : 0,
          totalTax,
          totalAmount,
          totalAmount,
          data.paymentTerms || null,
          data.notes || null,
          status === 'issued' ? new Date() : null
        ]
      );

      const invoiceId = invoiceResult.insertId;

      for (const item of processedItems) {
        await connection.query(
          `INSERT INTO invoice_items 
            (invoice_id, item_description, quantity, unit_price, discount_percent, tax_rate, line_total, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            item.item_description,
            item.quantity,
            item.unit_price,
            item.discount_percent,
            item.tax_rate,
            item.line_total,
            item.sort_order
          ]
        );
      }

      await connection.commit();

      await AuditService.log({
        userId: actorUser.id,
        action: 'INVOICE_CREATED',
        entity: 'invoices',
        entityId: invoiceId,
        details: { invoiceNumber, totalAmount, clientId }
      });

      return this.getInvoiceDetails(actorUser, invoiceId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * List Invoices
   */
  static async listInvoices(actorUser, filters = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (actorUser.client_id) {
      conditions.push('i.client_id = ?');
      params.push(actorUser.client_id);
    } else if (filters.clientId) {
      conditions.push('i.client_id = ?');
      params.push(filters.clientId);
    }

    if (filters.status && filters.status !== 'all') {
      conditions.push('i.status = ?');
      params.push(filters.status);
    }

    if (filters.search) {
      conditions.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    const query = `
      SELECT 
        i.*,
        c.name AS client_name,
        c.company_name AS client_company_name,
        u_creator.name AS created_by_name,
        p.name AS project_name,
        s.label AS service_name,
        q.quotation_number
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      JOIN users u_creator ON i.created_by = u_creator.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN service_instances s ON i.service_id = s.id
      LEFT JOIN quotations q ON i.quotation_id = q.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC
    `;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Get Invoice Details with Items and Payments
   */
  static async getInvoiceDetails(actorUser, invoiceId) {
    const [invoices] = await pool.query(
      `SELECT 
        i.*,
        c.name AS client_name,
        c.company_name AS client_company_name,
        c.address AS client_address,
        c.city AS client_city,
        c.gstin AS client_gstin,
        u_creator.name AS created_by_name,
        p.name AS project_name,
        s.label AS service_name,
        q.quotation_number
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      JOIN users u_creator ON i.created_by = u_creator.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN service_instances s ON i.service_id = s.id
      LEFT JOIN quotations q ON i.quotation_id = q.id
      WHERE i.id = ?`,
      [invoiceId]
    );

    if (invoices.length === 0) {
      throw { status: 404, message: 'Invoice not found' };
    }

    const invoice = invoices[0];

    // Client isolation check
    if (actorUser.client_id && Number(invoice.client_id) !== Number(actorUser.client_id)) {
      throw { status: 403, message: 'Access denied: You do not have permission to view this invoice' };
    }

    const [items] = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC',
      [invoiceId]
    );

    const [payments] = await pool.query(
      `SELECT p.*, u.name AS recorded_by_name
       FROM payments p
       JOIN users u ON p.recorded_by = u.id
       WHERE p.invoice_id = ?
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      [invoiceId]
    );

    return {
      invoice,
      items,
      payments
    };
  }

  /**
   * Issue an Invoice
   */
  static async issueInvoice(actorUser, invoiceId) {
    const { invoice } = await this.getInvoiceDetails(actorUser, invoiceId);

    if (invoice.status !== 'draft') {
      throw { status: 400, message: `Only draft invoices can be issued. Status is ${invoice.status}` };
    }

    await pool.query(
      "UPDATE invoices SET status = 'issued', issued_at = NOW(), updated_at = NOW() WHERE id = ?",
      [invoiceId]
    );

    await AuditService.log({
      userId: actorUser.id,
      action: 'INVOICE_ISSUED',
      entity: 'invoices',
      entityId: invoiceId,
      details: { invoiceNumber: invoice.invoice_number, clientId: invoice.client_id }
    });

    return this.getInvoiceDetails(actorUser, invoiceId);
  }

  /**
   * Void an Invoice
   */
  static async voidInvoice(actorUser, invoiceId) {
    const { invoice, payments } = await this.getInvoiceDetails(actorUser, invoiceId);

    if (payments.length > 0 && payments.some(p => p.payment_status === 'completed')) {
      throw { status: 400, message: 'Cannot void an invoice with confirmed payments. Reverse payments first' };
    }

    if (invoice.status === 'void') {
      return { invoice, payments };
    }

    await pool.query(
      "UPDATE invoices SET status = 'void', updated_at = NOW() WHERE id = ?",
      [invoiceId]
    );

    await AuditService.log({
      userId: actorUser.id,
      action: 'INVOICE_VOIDED',
      entity: 'invoices',
      entityId: invoiceId,
      details: { invoiceNumber: invoice.invoice_number }
    });

    return this.getInvoiceDetails(actorUser, invoiceId);
  }

  // =========================================================================
  // 3. PAYMENT RECORDING & TRACKING
  // =========================================================================

  /**
   * Record Manual Payment (Concurrency-safe and strictly prevents overpayment)
   */
  static async recordPayment(actorUser, invoiceId, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Row lock the invoice for atomic calculation
      const [invoices] = await connection.query(
        'SELECT * FROM invoices WHERE id = ? FOR UPDATE',
        [invoiceId]
      );
      if (invoices.length === 0) {
        throw { status: 404, message: 'Invoice not found' };
      }
      const invoice = invoices[0];

      if (['draft', 'void'].includes(invoice.status)) {
        throw { status: 400, message: `Cannot record payment on an invoice in status: ${invoice.status}` };
      }

      const amount = this.round2(data.amount);
      if (isNaN(amount) || amount <= 0) {
        throw { status: 400, message: 'Payment amount must be greater than zero' };
      }

      const currentBalance = this.round2(invoice.outstanding_balance);
      if (amount > currentBalance) {
        throw {
          status: 400,
          message: `Payment amount (${invoice.currency} ${amount}) exceeds outstanding balance of ${invoice.currency} ${currentBalance}`
        };
      }

      if (!data.paymentDate) {
        throw { status: 400, message: 'Payment date is required' };
      }

      const paymentReference = await this.generateNumber(connection, 'payments', 'payment_reference', 'PAY');
      const validMethods = ['bank_transfer', 'upi', 'cash', 'card', 'payment_gateway', 'other'];
      const method = validMethods.includes(data.paymentMethod) ? data.paymentMethod : 'bank_transfer';

      // Insert payment record
      const [payResult] = await connection.query(
        `INSERT INTO payments 
          (payment_reference, invoice_id, client_id, amount, payment_date, payment_method, transaction_reference, payment_status, recorded_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
        [
          paymentReference,
          invoiceId,
          invoice.client_id,
          amount,
          data.paymentDate,
          method,
          data.transactionReference || null,
          actorUser.id,
          data.notes || null
        ]
      );

      const paymentId = payResult.insertId;

      // Update invoice balances
      const newAmountPaid = this.round2(Number(invoice.amount_paid) + amount);
      const newBalance = this.round2(Number(invoice.total_amount) - newAmountPaid);
      const nextStatus = newBalance <= 0 ? 'paid' : 'partially_paid';

      await connection.query(
        `UPDATE invoices 
         SET amount_paid = ?, outstanding_balance = ?, status = ?, updated_at = NOW() 
         WHERE id = ?`,
        [newAmountPaid, newBalance, nextStatus, invoiceId]
      );

      await connection.commit();

      await AuditService.log({
        userId: actorUser.id,
        action: 'PAYMENT_RECORDED',
        entity: 'payments',
        entityId: paymentId,
        details: { paymentReference, amount, invoiceId, nextStatus }
      });

      // Notify Account Manager and client contacts
      const [clientUsers] = await pool.query('SELECT id FROM users WHERE client_id = ?', [invoice.client_id]);
      for (const u of clientUsers) {
        await NotificationsService.createNotification({
          userId: u.id,
          title: 'Payment Received',
          message: `Payment of ${invoice.currency} ${amount} recorded for invoice ${invoice.invoice_number}.`,
          type: 'billing',
          entityType: 'invoice',
          entityId: invoiceId
        });
      }

      return this.getInvoiceDetails(actorUser, invoiceId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Get Single Payment Receipt Details
   */
  static async getPaymentReceipt(actorUser, paymentId) {
    const [payments] = await pool.query(
      `SELECT 
        p.*,
        i.invoice_number,
        i.total_amount AS invoice_total,
        i.currency,
        c.name AS client_name,
        c.company_name AS client_company_name,
        c.address AS client_address,
        c.gstin AS client_gstin,
        u.name AS recorded_by_name
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN clients c ON p.client_id = c.id
      JOIN users u ON p.recorded_by = u.id
      WHERE p.id = ?`,
      [paymentId]
    );

    if (payments.length === 0) {
      throw { status: 404, message: 'Payment record not found' };
    }

    const payment = payments[0];
    if (actorUser.client_id && Number(payment.client_id) !== Number(actorUser.client_id)) {
      throw { status: 403, message: 'Access denied: You do not have permission to view this receipt' };
    }

    return payment;
  }

  /**
   * Get Billing Overview / Stats
   */
  static async getBillingStats(actorUser) {
    const conditions = ['1=1'];
    const params = [];

    if (actorUser.client_id) {
      conditions.push('client_id = ?');
      params.push(actorUser.client_id);
    }

    const whereClause = conditions.join(' AND ');

    const [invRows] = await pool.query(
      `SELECT 
        COUNT(*) AS total_invoices,
        COALESCE(SUM(total_amount), 0) AS total_invoiced,
        COALESCE(SUM(amount_paid), 0) AS total_collected,
        COALESCE(SUM(outstanding_balance), 0) AS total_outstanding,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN status = 'partially_paid' THEN 1 ELSE 0 END) AS partially_paid_count,
        SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) AS unpaid_count,
        SUM(CASE WHEN status = 'overdue' OR (due_date < CURDATE() AND status IN ('issued', 'partially_paid')) THEN 1 ELSE 0 END) AS overdue_count
       FROM invoices
       WHERE ${whereClause}`,
      params
    );

    const [quotRows] = await pool.query(
      `SELECT 
        COUNT(*) AS total_quotations,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_quotes,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS pending_quotes
       FROM quotations
       WHERE ${whereClause}`,
      params
    );

    const inv = invRows[0] || {};
    const quot = quotRows[0] || {};

    return {
      totalInvoices: Number(inv.total_invoices) || 0,
      totalInvoiced: Number(inv.total_invoiced) || 0,
      totalCollected: Number(inv.total_collected) || 0,
      totalOutstanding: Number(inv.total_outstanding) || 0,
      paidCount: Number(inv.paid_count) || 0,
      partiallyPaidCount: Number(inv.partially_paid_count) || 0,
      unpaidCount: Number(inv.unpaid_count) || 0,
      overdueCount: Number(inv.overdue_count) || 0,
      totalQuotations: Number(quot.total_quotations) || 0,
      acceptedQuotes: Number(quot.accepted_quotes) || 0,
      pendingQuotes: Number(quot.pending_quotes) || 0
    };
  }

  /**
   * Generate Printable Branded HTML Document for Quotation, Invoice, or Receipt
   */
  static async generateDocumentHtml(actorUser, docType, id) {
    if (docType === 'quotation') {
      const { quotation, items } = await this.getQuotationDetails(actorUser, id);
      return this.renderDocumentTemplate({
        type: 'QUOTATION',
        number: quotation.quotation_number,
        title: quotation.title,
        date: new Date(quotation.quotation_date).toLocaleDateString(),
        dueDate: new Date(quotation.expiry_date).toLocaleDateString(),
        dueDateLabel: 'Expiry Date',
        clientName: quotation.client_company_name || quotation.client_name,
        clientAddress: quotation.client_address || '',
        clientCity: quotation.client_city || '',
        clientGstin: quotation.client_gstin || '',
        currency: quotation.currency || 'INR',
        items,
        subtotal: quotation.subtotal,
        discount: quotation.discount_amount,
        tax: quotation.tax_amount,
        total: quotation.total_amount,
        terms: quotation.terms_and_conditions,
        notes: quotation.notes,
        status: quotation.status
      });
    } else if (docType === 'invoice') {
      const { invoice, items, payments } = await this.getInvoiceDetails(actorUser, id);
      return this.renderDocumentTemplate({
        type: 'TAX INVOICE',
        number: invoice.invoice_number,
        title: `Invoice for ${invoice.client_company_name || invoice.client_name}`,
        date: new Date(invoice.invoice_date).toLocaleDateString(),
        dueDate: new Date(invoice.due_date).toLocaleDateString(),
        dueDateLabel: 'Payment Due',
        clientName: invoice.client_company_name || invoice.client_name,
        clientAddress: invoice.client_address || '',
        clientCity: invoice.client_city || '',
        clientGstin: invoice.client_gstin || '',
        currency: invoice.currency || 'INR',
        items,
        subtotal: invoice.subtotal,
        discount: invoice.discount_amount,
        tax: invoice.tax_amount,
        total: invoice.total_amount,
        amountPaid: invoice.amount_paid,
        balance: invoice.outstanding_balance,
        terms: invoice.payment_terms,
        notes: invoice.notes,
        status: invoice.status,
        payments
      });
    } else if (docType === 'receipt') {
      const receipt = await this.getPaymentReceipt(actorUser, id);
      return this.renderDocumentTemplate({
        type: 'OFFICIAL RECEIPT',
        number: receipt.payment_reference,
        title: `Payment Receipt for ${receipt.invoice_number}`,
        date: new Date(receipt.payment_date).toLocaleDateString(),
        clientName: receipt.client_company_name || receipt.client_name,
        clientAddress: receipt.client_address || '',
        currency: receipt.currency || 'INR',
        items: [
          {
            item_description: `Payment towards Invoice ${receipt.invoice_number} via ${receipt.payment_method.toUpperCase()}`,
            quantity: 1,
            unit_price: receipt.amount,
            line_total: receipt.amount
          }
        ],
        subtotal: receipt.amount,
        total: receipt.amount,
        notes: receipt.notes || `Transaction Ref: ${receipt.transaction_reference || 'N/A'}`,
        status: receipt.payment_status
      });
    }

    throw { status: 400, message: 'Invalid document type' };
  }

  /**
   * HTML Template Renderer with D-Grow Theme & Print Styling
   */
  static renderDocumentTemplate(data) {
    const symbol = data.currency === 'INR' ? '₹' : data.currency;

    const rows = (data.items || []).map((item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 13px; color: #64748b;">${idx + 1}</td>
        <td style="padding: 10px 12px; font-size: 13px; font-weight: 500; color: #1e293b;">${item.item_description}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: center; color: #475569;">${item.quantity}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #475569;">${symbol} ${Number(item.unit_price).toLocaleString()}</td>
        <td style="padding: 10px 12px; font-size: 13px; text-align: right; font-weight: 600; color: #0f172a;">${symbol} ${Number(item.line_total).toLocaleString()}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${data.type} - ${data.number}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #047857; padding-bottom: 18px; margin-bottom: 24px; }
    .brand-logo { font-size: 24px; font-weight: 800; color: #047857; letter-spacing: -0.5px; }
    .brand-subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
    .doc-meta { text-align: right; }
    .doc-type { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
    .doc-number { font-size: 14px; font-family: monospace; font-weight: 700; color: #047857; margin-top: 2px; }
    .doc-status { display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 6px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 28px; }
    .party-box { width: 48%; }
    .party-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 6px; }
    .party-name { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .party-details { font-size: 12px; color: #475569; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f8fafc; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; text-align: left; }
    .totals-area { display: flex; justify-content: flex-end; margin-bottom: 28px; }
    .totals-box { width: 320px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #475569; }
    .totals-row.grand { border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; padding: 10px 0; font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 6px; }
    .notes-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 12px; color: #475569; line-height: 1.6; margin-top: 18px; }
    .footer { border-top: 1px solid #e2e8f0; margin-top: 36px; padding-top: 14px; text-align: center; font-size: 11px; color: #94a3b8; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="no-print" style="margin-bottom: 16px; text-align: right;">
      <button onclick="window.print()" style="background: #047857; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
        🖨️ Print / Save as PDF
      </button>
    </div>

    <div class="header">
      <div>
        <div class="brand-logo">D-GROW OS</div>
        <div class="brand-subtitle">Agency Growth Management & Billing</div>
      </div>
      <div class="doc-meta">
        <div class="doc-type">${data.type}</div>
        <div class="doc-number">${data.number}</div>
        <div><span class="doc-status">${data.status}</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party-box">
        <div class="party-title">Bill To / Client</div>
        <div class="party-name">${data.clientName}</div>
        <div class="party-details">
          ${data.clientAddress ? `${data.clientAddress}<br>` : ''}
          ${data.clientCity ? `${data.clientCity}<br>` : ''}
          ${data.clientGstin ? `GSTIN: ${data.clientGstin}` : ''}
        </div>
      </div>
      <div class="party-box" style="text-align: right;">
        <div class="party-title">Document Details</div>
        <div class="party-details">
          <strong>Date:</strong> ${data.date}<br>
          ${data.dueDate ? `<strong>${data.dueDateLabel || 'Due Date'}:</strong> ${data.dueDate}<br>` : ''}
          <strong>Currency:</strong> ${data.currency}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>Description</th>
          <th style="width: 70px; text-align: center;">Qty</th>
          <th style="width: 120px; text-align: right;">Unit Price</th>
          <th style="width: 130px; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals-area">
      <div class="totals-box">
        <div class="totals-row">
          <span>Subtotal:</span>
          <span>${symbol} ${Number(data.subtotal || 0).toLocaleString()}</span>
        </div>
        ${data.discount ? `
        <div class="totals-row">
          <span>Discount:</span>
          <span>- ${symbol} ${Number(data.discount).toLocaleString()}</span>
        </div>` : ''}
        ${data.tax ? `
        <div class="totals-row">
          <span>Tax:</span>
          <span>+ ${symbol} ${Number(data.tax).toLocaleString()}</span>
        </div>` : ''}
        <div class="totals-row grand">
          <span>Total:</span>
          <span>${symbol} ${Number(data.total || 0).toLocaleString()}</span>
        </div>
        ${data.amountPaid !== undefined ? `
        <div class="totals-row" style="color: #047857; font-weight: 600;">
          <span>Amount Paid:</span>
          <span>${symbol} ${Number(data.amountPaid || 0).toLocaleString()}</span>
        </div>
        <div class="totals-row" style="color: #e11d48; font-weight: 700;">
          <span>Outstanding Balance:</span>
          <span>${symbol} ${Number(data.balance || 0).toLocaleString()}</span>
        </div>` : ''}
      </div>
    </div>

    ${data.terms ? `
    <div class="notes-box">
      <strong>Terms & Conditions:</strong><br>
      ${data.terms}
    </div>` : ''}

    ${data.notes ? `
    <div class="notes-box" style="margin-top: 10px;">
      <strong>Notes:</strong><br>
      ${data.notes}
    </div>` : ''}

    <div class="footer">
      Generated automatically by D-Grow Operating System. This is a computer-generated document.
    </div>
  </div>
</body>
</html>
    `;
  }
}
