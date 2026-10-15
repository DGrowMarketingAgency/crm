import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { seedRbac } from '../src/modules/rbac/rbac.seed.js';

describe('Phase 6: Client Support Tickets, Quotations, Invoicing & Payment Tracking Suite', () => {
  let csrfToken = '';
  let csrfCookie = '';

  let ownerCookie = '';
  let amCookie = '';
  let employeeCookie = '';
  let clientACookie = '';
  let clientBCookie = '';

  let ownerId;
  let amId;
  let employeeId;
  let clientAUserId;
  let clientBUserId;

  let testClientAId;
  let testClientBId;
  let testProjectId;

  let createdTicketId;
  let createdQuotationId;
  let convertedInvoiceId;
  let standaloneInvoiceId;

  beforeAll(async () => {
    // 1. Seed RBAC
    await seedRbac();

    // 2. Fetch CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf-token');
    csrfToken = csrfRes.body.csrfToken;
    const cookies = csrfRes.headers['set-cookie'];
    csrfCookie = cookies.find((c) => c.startsWith('xsrf_token='));

    const testPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // 3. Setup Test Clients
    await pool.query(
      `INSERT INTO clients (name, email, client_code, status, lifecycle_stage, entity)
       VALUES ('Support Client A', 'support_client_a@test.com', 'CLT-SUPA', 'active', 'L2', 'D-Grow')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [c1] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLT-SUPA'");
    testClientAId = c1[0].id;

    await pool.query(
      `INSERT INTO clients (name, email, client_code, status, lifecycle_stage, entity)
       VALUES ('Support Client B', 'support_client_b@test.com', 'CLT-SUPB', 'active', 'L2', 'D-Grow')
       ON DUPLICATE KEY UPDATE status = 'active'`
    );
    const [c2] = await pool.query("SELECT id FROM clients WHERE client_code = 'CLT-SUPB'");
    testClientBId = c2[0].id;

    // Helper to create test user and login
    const setupUser = async (email, name, roleSlug, clientId = null) => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, status, client_id)
         VALUES (?, ?, ?, 'active', ?)
         ON DUPLICATE KEY UPDATE status = 'active', client_id = ?`,
        [name, email, passwordHash, clientId, clientId]
      );
      const [uRows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      const uid = uRows[0].id;

      const [rRows] = await pool.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
      if (rRows.length > 0) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE role_id = role_id`,
          [uid, rRows[0].id]
        );
      }

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ email, password: testPassword });

      const setCookies = loginRes.headers['set-cookie'] || [];
      const accessCookie = setCookies.find((c) => c.startsWith('access_token='));
      return { id: uid, cookie: `${csrfCookie}; ${accessCookie}` };
    };

    const ownerRes = await setupUser('owner_p6@test.com', 'Phase6 Owner', 'owner');
    ownerId = ownerRes.id;
    ownerCookie = ownerRes.cookie;

    const amRes = await setupUser('am_p6@test.com', 'Phase6 AM', 'account-manager');
    amId = amRes.id;
    amCookie = amRes.cookie;

    const empRes = await setupUser('emp_p6@test.com', 'Phase6 Employee', 'employee');
    employeeId = empRes.id;
    employeeCookie = empRes.cookie;

    const cliARes = await setupUser('client_p6_a@test.com', 'Client A User', 'client', testClientAId);
    clientAUserId = cliARes.id;
    clientACookie = cliARes.cookie;

    const cliBRes = await setupUser('client_p6_b@test.com', 'Client B User', 'client', testClientBId);
    clientBUserId = cliBRes.id;
    clientBCookie = cliBRes.cookie;

    // Set Account Manager on Client A
    await pool.query('UPDATE clients SET account_manager_id = ? WHERE id = ?', [amId, testClientAId]);

    // Setup Test Project for Client A
    await pool.query(
      `INSERT INTO projects (name, project_code, client_id, status, project_manager_id, created_by)
       VALUES ('Client A Website Project', 'PRJ-SUPA', ?, 'active', ?, ?)
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [testClientAId, amId, ownerId]
    );
    const [pRows] = await pool.query("SELECT id FROM projects WHERE project_code = 'PRJ-SUPA'");
    testProjectId = pRows[0].id;
  });

  afterAll(async () => {
    // Cleanup created test records
    if (createdTicketId) {
      await pool.query('DELETE FROM ticket_messages WHERE ticket_id = ?', [createdTicketId]);
      await pool.query('DELETE FROM support_tickets WHERE id = ?', [createdTicketId]);
    }
    if (convertedInvoiceId) {
      await pool.query('DELETE FROM payments WHERE invoice_id = ?', [convertedInvoiceId]);
      await pool.query('DELETE FROM invoice_items WHERE invoice_id = ?', [convertedInvoiceId]);
      await pool.query('DELETE FROM invoices WHERE id = ?', [convertedInvoiceId]);
    }
    if (standaloneInvoiceId) {
      await pool.query('DELETE FROM payments WHERE invoice_id = ?', [standaloneInvoiceId]);
      await pool.query('DELETE FROM invoice_items WHERE invoice_id = ?', [standaloneInvoiceId]);
      await pool.query('DELETE FROM invoices WHERE id = ?', [standaloneInvoiceId]);
    }
    if (createdQuotationId) {
      await pool.query('DELETE FROM quotation_items WHERE quotation_id = ?', [createdQuotationId]);
      await pool.query('DELETE FROM quotations WHERE id = ?', [createdQuotationId]);
    }
  });

  // =========================================================================
  // 1. SUPPORT TICKET TESTS
  // =========================================================================

  it('1. Client creates a support ticket with auto-generated ticket number and auto-assignment to AM', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({
        subject: 'Header navigation link broken on mobile',
        description: 'When tapping the contact link on iOS Safari, the drawer does not open.',
        category: 'Website / Development',
        priority: 'high',
        projectId: testProjectId
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.ticket).toBeDefined();
    expect(res.body.ticket.ticket.ticket_number).toMatch(/^TICK-\d{6}-\d{4}$/);
    expect(res.body.ticket.ticket.client_id).toBe(testClientAId);
    expect(res.body.ticket.ticket.assigned_to).toBe(amId);
    expect(res.body.ticket.ticket.status).toBe('assigned');

    createdTicketId = res.body.ticket.ticket.id;
  });

  it('2. Account Manager views ticket and replies with client-visible message', async () => {
    const res = await request(app)
      .post(`/api/tickets/${createdTicketId}/messages`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        message: 'We have identified the responsive CSS issue and our dev team is on it.',
        messageType: 'reply'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
    // Ticket status updated to waiting_client or in_progress
    expect(['waiting_client', 'assigned', 'in_progress']).toContain(res.body.ticket.status);
  });

  it('3. Employee adds internal-only note; Client query MUST NOT expose internal note', async () => {
    // Employee posts internal note
    const noteRes = await request(app)
      .post(`/api/tickets/${createdTicketId}/messages`)
      .set('Cookie', employeeCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        message: 'Internal Note: John check the z-index on .mobile-nav-drawer in tailwind config.',
        messageType: 'internal_note'
      });

    expect(noteRes.status).toBe(200);

    // Employee sees the internal note
    const empView = await request(app)
      .get(`/api/tickets/${createdTicketId}`)
      .set('Cookie', employeeCookie);
    expect(empView.status).toBe(200);
    const hasInternalNote = empView.body.messages.some(m => m.message_type === 'internal_note');
    expect(hasInternalNote).toBe(true);

    // Client user queries the SAME ticket: internal note MUST NOT be returned!
    const clientView = await request(app)
      .get(`/api/tickets/${createdTicketId}`)
      .set('Cookie', clientACookie);
    expect(clientView.status).toBe(200);
    const clientSeesInternal = clientView.body.messages.some(m => m.message_type === 'internal_note');
    expect(clientSeesInternal).toBe(false);
  });

  it('4. Client adds reply, reactivating ticket', async () => {
    const res = await request(app)
      .post(`/api/tickets/${createdTicketId}/messages`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({
        message: 'Thanks for the quick response! Looking forward to the update.'
      });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('in_progress');
  });

  it('5. Cross-tenant isolation: Client B cannot view or reply to Client A ticket', async () => {
    const res = await request(app)
      .get(`/api/tickets/${createdTicketId}`)
      .set('Cookie', clientBCookie);

    expect(res.status).toBe(403);
  });

  // =========================================================================
  // 2. QUOTATION TESTS
  // =========================================================================

  it('6. Staff creates a quotation with decimal-safe line item arithmetic', async () => {
    // 2 items:
    // Item 1: Qty 2, Unit Price 10000, 10% discount, 18% tax
    //   Base: 20000, Discount: 2000, Taxable: 18000, Tax: 3240, Total: 21240
    // Item 2: Qty 1, Unit Price 5000, 0% discount, 18% tax
    //   Base: 5000, Discount: 0, Taxable: 5000, Tax: 900, Total: 5900
    // Subtotal: 25000, Total Discount: 2000, Total Tax: 4140, Total Amount: 27140
    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/quotations')
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        clientId: testClientAId,
        projectId: testProjectId,
        title: 'Quarterly SEO & Conversion Rate Optimization',
        quotationDate: today,
        expiryDate: expiry,
        currency: 'INR',
        termsAndConditions: 'Payment terms 15 days upon invoice generation.',
        items: [
          {
            item_description: 'Monthly SEO Retainer & Local GEO Strategy',
            quantity: 2,
            unitPrice: 10000.00,
            discountPercent: 10.00,
            taxRate: 18.00
          },
          {
            item_description: 'Conversion Rate Optimization Audit',
            quantity: 1,
            unitPrice: 5000.00,
            discountPercent: 0.00,
            taxRate: 18.00
          }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.quotation).toBeDefined();
    expect(res.body.quotation.quotation_number).toMatch(/^QUOT-\d{6}-\d{4}$/);
    expect(Number(res.body.quotation.subtotal)).toBe(25000.00);
    expect(Number(res.body.quotation.discount_amount)).toBe(2000.00);
    expect(Number(res.body.quotation.tax_amount)).toBe(4140.00);
    expect(Number(res.body.quotation.total_amount)).toBe(27140.00);
    expect(res.body.quotation.status).toBe('draft');

    createdQuotationId = res.body.quotation.id;
  });

  it('7. Staff issues quotation; moves status to sent and notifies client', async () => {
    const res = await request(app)
      .post(`/api/quotations/${createdQuotationId}/issue`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.quotation.status).toBe('sent');
  });

  it('8. Client A accepts quotation in client portal', async () => {
    const res = await request(app)
      .post(`/api/quotations/${createdQuotationId}/review`)
      .set('Cookie', clientACookie)
      .set('x-csrf-token', csrfToken)
      .send({
        decision: 'accept'
      });

    expect(res.status).toBe(200);
    expect(res.body.quotation.status).toBe('accepted');
    expect(res.body.quotation.client_decision_by).toBe(clientAUserId);
    expect(res.body.quotation.client_decision_at).toBeDefined();
  });

  it('9. Converts accepted quotation to invoice; prevents duplicate conversion', async () => {
    const res = await request(app)
      .post(`/api/quotations/${createdQuotationId}/convert`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.invoice_number).toMatch(/^INV-\d{6}-\d{4}$/);
    expect(res.body.invoice.quotation_id).toBe(createdQuotationId);
    expect(Number(res.body.invoice.total_amount)).toBe(27140.00);
    expect(Number(res.body.invoice.outstanding_balance)).toBe(27140.00);
    expect(Number(res.body.invoice.amount_paid)).toBe(0.00);
    expect(res.body.invoice.status).toBe('issued');

    convertedInvoiceId = res.body.invoice.id;

    // Retry conversion: MUST fail to prevent duplicate invoicing
    const retryRes = await request(app)
      .post(`/api/quotations/${createdQuotationId}/convert`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken);

    expect(retryRes.status).toBe(400);
    expect(retryRes.body.error.message || retryRes.body.message).toMatch(/already been converted/i);
  });

  // =========================================================================
  // 3. INVOICING & PAYMENT TRACKING TESTS
  // =========================================================================

  it('10. Partial payment recording: verifies balance reduction and partially_paid status', async () => {
    // Total is ₹27,140. Record payment of ₹10,000.
    const res = await request(app)
      .post(`/api/invoices/${convertedInvoiceId}/payments`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        amount: 10000.00,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        transactionReference: 'NEFT9923849102',
        notes: 'First tranche payment received via HDFC Bank'
      });

    expect(res.status).toBe(201);
    expect(res.body.invoice).toBeDefined();
    expect(Number(res.body.invoice.amount_paid)).toBe(10000.00);
    expect(Number(res.body.invoice.outstanding_balance)).toBe(17140.00);
    expect(res.body.invoice.status).toBe('partially_paid');
    expect(res.body.payments.length).toBe(1);
    expect(res.body.payments[0].payment_reference).toMatch(/^PAY-\d{6}-\d{4}$/);
  });

  it('11. Zero and negative payment amounts are rejected', async () => {
    const zeroRes = await request(app)
      .post(`/api/invoices/${convertedInvoiceId}/payments`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        amount: 0,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    expect(zeroRes.status).toBe(400);

    const negRes = await request(app)
      .post(`/api/invoices/${convertedInvoiceId}/payments`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        amount: -500,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    expect(negRes.status).toBe(400);
  });

  it('12. Overpayment prevention: payment exceeding outstanding balance is strictly rejected', async () => {
    // Current outstanding balance is ₹17,140. Attempt ₹20,000.
    const overRes = await request(app)
      .post(`/api/invoices/${convertedInvoiceId}/payments`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        amount: 20000.00,
        paymentDate: new Date().toISOString().split('T')[0]
      });

    expect(overRes.status).toBe(400);
    expect(overRes.body.error.message || overRes.body.message).toMatch(/exceeds outstanding balance/i);
  });

  it('13. Final payment completes invoice: status changes to paid, balance is 0.00', async () => {
    // Settle remaining ₹17,140
    const res = await request(app)
      .post(`/api/invoices/${convertedInvoiceId}/payments`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        amount: 17140.00,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'upi',
        transactionReference: 'UPI/29402941094'
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.invoice.amount_paid)).toBe(27140.00);
    expect(Number(res.body.invoice.outstanding_balance)).toBe(0.00);
    expect(res.body.invoice.status).toBe('paid');
    expect(res.body.payments.length).toBe(2);
  });

  it('14. Cross-tenant isolation: Client B cannot view or access Client A invoices', async () => {
    const res = await request(app)
      .get(`/api/invoices/${convertedInvoiceId}`)
      .set('Cookie', clientBCookie);

    expect(res.status).toBe(403);
  });

  it('15. Cannot void an invoice that has confirmed payments', async () => {
    const res = await request(app)
      .post(`/api/invoices/${convertedInvoiceId}/void`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(400);
    expect(res.body.error.message || res.body.message).toMatch(/Cannot void an invoice with confirmed payments/i);
  });

  it('16. Generates printable branded HTML document for invoice and quotation', async () => {
    const invDoc = await request(app)
      .get(`/api/billing/documents/invoice/${convertedInvoiceId}`)
      .set('Cookie', clientACookie);

    expect(invDoc.status).toBe(200);
    expect(invDoc.text).toContain('TAX INVOICE');
    expect(invDoc.text).toContain('D-GROW OS');
    expect(invDoc.text).toContain('27,140');

    const quotDoc = await request(app)
      .get(`/api/billing/documents/quotation/${createdQuotationId}`)
      .set('Cookie', clientACookie);

    expect(quotDoc.status).toBe(200);
    expect(quotDoc.text).toContain('QUOTATION');
  });

  it('17. Standalone draft invoice creation and cancellation/voiding', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/invoices')
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        clientId: testClientAId,
        invoiceDate: today,
        dueDate: today,
        currency: 'INR',
        items: [
          {
            item_description: 'Custom Development Hours',
            quantity: 10,
            unitPrice: 1500.00
          }
        ]
      });

    expect(res.status).toBe(201);
    standaloneInvoiceId = res.body.invoice.id;

    // Void the standalone invoice
    const voidRes = await request(app)
      .post(`/api/invoices/${standaloneInvoiceId}/void`)
      .set('Cookie', amCookie)
      .set('x-csrf-token', csrfToken);

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.invoice.status).toBe('void');
  });

  it('18. Ticket dashboard stats and billing overview stats aggregate real DB rows', async () => {
    const ticketStats = await request(app)
      .get('/api/tickets/stats')
      .set('Cookie', amCookie);

    expect(ticketStats.status).toBe(200);
    expect(ticketStats.body.stats.total).toBeGreaterThanOrEqual(1);

    const billingStats = await request(app)
      .get('/api/billing/stats')
      .set('Cookie', amCookie);

    expect(billingStats.status).toBe(200);
    expect(billingStats.body.stats.totalInvoices).toBeGreaterThanOrEqual(1);
    expect(billingStats.body.stats.totalCollected).toBeGreaterThanOrEqual(27140.00);
  });
});
