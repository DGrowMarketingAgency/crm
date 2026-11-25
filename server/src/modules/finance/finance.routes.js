import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';
import { FinanceService as F } from './finance.service.js';
import { renderTaxInvoice } from './invoiceTemplate.js';
import { sendPrintable } from './documentTemplate.js';
import { env } from '../../config/env.js';
import { FinanceReportsService } from './reports.service.js';
import { BillingAlertsService } from './billingAlerts.service.js';
import { isClientPortalUser } from '../project-flow/projectFlow.service.js';
import { settingsSchema, seriesSchema, clientBillingSchema, serviceTaxSchema, invoiceSchema, cancelSchema } from './finance.validation.js';

const router = Router();

router.use('/finance', authenticate, (req, res, next) => {
  if (isClientPortalUser(req.user)) {
    return res.status(403).json({ success: false, error: { message: 'Client portal accounts use the client billing pages', code: 'FORBIDDEN' } });
  }
  next();
});

const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (e) {
    next(e);
  }
};
const id = (req, k = 'id') => Number(req.params[k]);

// Settings & number series
router.get('/finance/settings', requirePermission('invoices.view'), handle(async () => ({ settings: await F.getSettings(), series: await F.listSeries() })));
router.put('/finance/settings', requirePermission('finance.settings.manage'), csrfProtection, validate(settingsSchema),
  handle(async (req) => ({ settings: await F.updateSettings(req.body, req.user, req) })));
router.put('/finance/series/:code', requirePermission('finance.settings.manage'), csrfProtection, validate(seriesSchema),
  handle(async (req) => ({ series: await F.updateSeries(String(req.params.code).toUpperCase(), req.body, req.user, req) })));

// Masters
router.get('/finance/lookups', requirePermission('invoices.view'), handle(async () => F.getLookups()));
router.get('/finance/clients', requirePermission('invoices.view'), handle(async (req) => ({ clients: await F.listBillingClients({ search: String(req.query.search || '') }) })));
router.put('/finance/clients/:id/billing', requirePermission('clients.update'), csrfProtection, validate(clientBillingSchema),
  handle(async (req) => ({ client: await F.updateClientBilling(id(req), req.body, req.user, req) })));
router.get('/finance/clients/:id/projects', requirePermission('invoices.view'), handle(async (req) => ({ projects: await F.clientProjects(id(req)) })));
router.get('/finance/services', requirePermission('invoices.view'), handle(async () => ({ services: await F.listServiceTaxes() })));
router.put('/finance/services/:id/tax', requirePermission('finance.settings.manage'), csrfProtection, validate(serviceTaxSchema),
  handle(async (req) => ({ service: await F.updateServiceTax(id(req), req.body, req.user, req) })));

// GST invoices
router.get('/finance/invoices', requirePermission('invoices.view'), handle(async (req) => F.listInvoices(req.query)));
router.post('/finance/invoices', requirePermission('invoices.create'), csrfProtection, validate(invoiceSchema),
  handle(async (req) => {
    if (req.body.issue && !req.user.isOwner && !req.user.permissions?.includes('invoices.issue')) {
      const e = new Error('You can save drafts but not issue invoices'); e.status = 403; throw e;
    }
    return F.createDraft(req.body, req.user, req);
  }, 201));
router.get('/finance/invoices/:id', requirePermission('invoices.view'), handle(async (req) => F.getInvoice(id(req))));
router.put('/finance/invoices/:id', requirePermission('invoices.create'), csrfProtection, validate(invoiceSchema),
  handle(async (req) => {
    if (req.body.issue && !req.user.isOwner && !req.user.permissions?.includes('invoices.issue')) {
      const e = new Error('You can save drafts but not issue invoices'); e.status = 403; throw e;
    }
    return F.updateDraft(id(req), req.body, req.user, req);
  }));
router.post('/finance/invoices/:id/issue', requirePermission('invoices.issue'), csrfProtection, handle(async (req) => F.issue(id(req), req.user, req)));
router.post('/finance/invoices/:id/cancel', requirePermission('invoices.void'), csrfProtection, validate(cancelSchema),
  handle(async (req) => F.cancel(id(req), req.body.reason, req.user, req)));
router.post('/finance/invoices/:id/duplicate', requirePermission('invoices.create'), csrfProtection,
  handle(async (req) => F.duplicate(id(req), req.user, req), 201));
// Reason reuses the cancel schema (min 3 characters).
router.post('/finance/invoices/:id/payments/:paymentId/reverse', requirePermission('payments.record'), csrfProtection, validate(cancelSchema),
  handle(async (req) => F.reversePayment(id(req), Number(req.params.paymentId), req.body.reason, req.user, req)));
router.get('/finance/invoices/:id/print', requirePermission('invoices.view'), async (req, res, next) => {
  try {
    const [doc, settings] = await Promise.all([F.getInvoice(id(req)), F.getSettings()]);
    sendPrintable(res, renderTaxInvoice(doc, settings, env.CLIENT_URL), env.CLIENT_URL);
  } catch (e) {
    next(e);
  }
});

// Reports (sales register, GST summary, receivables aging, payments) with Excel export
const REPORTS = {
  'sales-register': (q) => FinanceReportsService.salesRegister(q),
  'gst-summary': (q) => FinanceReportsService.gstSummary(q),
  aging: (q) => FinanceReportsService.aging(q),
  payments: (q) => FinanceReportsService.paymentsReceived(q)
};
const dateOk = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
router.get('/finance/reports/:report', requirePermission('finance.reports.view'), async (req, res, next) => {
  try {
    const fn = REPORTS[req.params.report];
    const q = { from: req.query.from, to: req.query.to, asOf: req.query.asOf, type: req.query.type };
    if (!fn) return res.status(404).json({ success: false, error: { message: 'Unknown report', code: 'NOT_FOUND' } });
    if (![q.from, q.to, q.asOf].every(dateOk) || (q.type && !['INV', 'INC', 'IND'].includes(q.type))) {
      return res.status(400).json({ success: false, error: { message: 'Dates must be YYYY-MM-DD', code: 'VALIDATION_ERROR' } });
    }
    if (q.from && q.to && q.from > q.to) {
      return res.status(400).json({ success: false, error: { message: 'From date must be before To date', code: 'VALIDATION_ERROR' } });
    }
    if (req.query.format === 'xlsx') {
      const wb = await FinanceReportsService.toWorkbook(req.params.report, q);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.report}-${q.from || q.asOf || 'today'}${q.to ? `-to-${q.to}` : ''}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }
    res.json(await fn(q));
  } catch (e) {
    next(e);
  }
});

// Billing alerts: overdue / due / renewals, and a manual "send reminders now"
router.get('/finance/alerts', requirePermission('invoices.view'), handle(async () => BillingAlertsService.live()));
router.post('/finance/alerts/run', requirePermission('finance.settings.manage'), csrfProtection, handle(async () => BillingAlertsService.runReminders()));

export default router;
