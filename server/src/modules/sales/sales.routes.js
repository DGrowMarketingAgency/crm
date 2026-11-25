import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';
import { isClientPortalUser } from '../project-flow/projectFlow.service.js';
import { SalesService as S } from './sales.service.js';
import {
  leadSchema, interactionSchema, assignSchema, onboardSchema, meetingSchema, meetingUpdateSchema,
  proposalSchema, convertSchema, publicDecisionSchema,
  quoteSchema, quoteUpdateSchema, quoteReviseSchema, quoteClientRequestSchema, quoteDecideSchema, publicQuoteDecisionSchema, quoteConvertSchema, quoteCancelSchema
} from './sales.validation.js';
import { SalesQuotesService as Q } from './salesQuotes.service.js';
import { renderQuotation } from './quoteTemplate.js';
import { sendPrintable } from '../finance/documentTemplate.js';
import { FinanceService } from '../finance/finance.service.js';
import { env } from '../../config/env.js';

/** Sends a printable quotation (same layout as the agency invoice). */
const printQuote = (load) => async (req, res, next) => {
  try {
    const [data, settings] = await Promise.all([load(req), FinanceService.getSettings()]);
    sendPrintable(res, renderQuotation(data, settings, env.CLIENT_URL), env.CLIENT_URL);
  } catch (e) {
    next(e);
  }
};

const router = Router();
const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (e) {
    next(e);
  }
};
const id = (req) => Number(req.params.id);

// ── Public proposal link (no login; the 32-character token is the secret) ──
// Exported separately and mounted at /api/public BEFORE the other /api routers, several of which
// require a login for every request that passes through them.
export const publicSalesRouter = Router();
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
publicSalesRouter.get('/proposals/:token', publicLimiter, handle(async (req) => S.publicView(String(req.params.token))));
publicSalesRouter.post('/proposals/:token/decision', publicLimiter, validate(publicDecisionSchema),
  handle(async (req) => {
    if (req.body.decision === 'accept' && !req.body.tierId) {
      const e = new Error('Choose one of the packages'); e.status = 400; throw e;
    }
    return S.publicDecide(String(req.params.token), req.body);
  }));

publicSalesRouter.get('/quotes/:token/print', publicLimiter, printQuote((req) => Q.publicPrintData(String(req.params.token))));
publicSalesRouter.get('/quotes/:token', publicLimiter, handle(async (req) => Q.publicView(String(req.params.token))));
publicSalesRouter.post('/quotes/:token/decision', publicLimiter, validate(publicQuoteDecisionSchema),
  handle(async (req) => Q.publicDecide(String(req.params.token), req.body)));

// ── Staff sales routes ──
router.use('/sales', authenticate, (req, res, next) => {
  if (isClientPortalUser(req.user)) {
    return res.status(403).json({ success: false, error: { message: 'Not available for client accounts', code: 'FORBIDDEN' } });
  }
  next();
});

router.get('/sales/dashboard', requirePermission('leads.view'), handle(async (req) => S.dashboard(req.user, req.query)));
// Quotations: marketing people request (no prices); admins price, send, revise and close.
router.get('/sales/quotes', requirePermission('sales_quotes.view'), handle(async (req) => Q.list(req.user, req.query)));
router.get('/sales/quotes/:id/print', requirePermission('sales_quotes.view'), printQuote((req) => Q.printData(id(req), req.user)));
router.get('/sales/quotes/:id', requirePermission('sales_quotes.view'), handle(async (req) => Q.get(id(req), req.user)));
router.post('/sales/quotes', requirePermission(['sales_quotes.request', 'sales_quotes.price']), csrfProtection, validate(quoteSchema),
  handle(async (req) => Q.create(req.body, req.user, req), 201));
router.put('/sales/quotes/:id', requirePermission(['sales_quotes.request', 'sales_quotes.price']), csrfProtection, validate(quoteUpdateSchema),
  handle(async (req) => Q.update(id(req), req.body, req.user, req)));
router.post('/sales/quotes/:id/send', requirePermission('sales_quotes.price'), csrfProtection, handle(async (req) => Q.send(id(req), req.user, req)));
router.post('/sales/quotes/:id/revise', requirePermission('sales_quotes.price'), csrfProtection, validate(quoteReviseSchema),
  handle(async (req) => Q.revise(id(req), req.body, req.user, req)));
router.post('/sales/quotes/:id/client-request', requirePermission('sales_quotes.view'), csrfProtection, validate(quoteClientRequestSchema),
  handle(async (req) => Q.logClientRequest(id(req), req.body, req.user, req)));
router.post('/sales/quotes/:id/cancel', requirePermission('sales_quotes.price'), csrfProtection, validate(quoteCancelSchema),
  handle(async (req) => Q.cancel(id(req), req.body, req.user, req)));
router.post('/sales/quotes/:id/duplicate', requirePermission(['sales_quotes.request', 'sales_quotes.price']), csrfProtection,
  handle(async (req) => Q.duplicate(id(req), req.user, req), 201));
router.delete('/sales/quotes/:id', requirePermission(['sales_quotes.request', 'sales_quotes.price']), csrfProtection,
  handle(async (req) => Q.remove(id(req), req.user, req)));
router.post('/sales/quotes/:id/convert', requirePermission('sales_quotes.price'), csrfProtection, validate(quoteConvertSchema),
  handle(async (req) => Q.convert(id(req), req.body, req.user, req)));
router.post('/sales/proposals/:id/quote', requirePermission('sales_quotes.price'), csrfProtection,
  handle(async (req) => Q.fromProposal(id(req), req.user, req), 201));
router.post('/sales/quotes/:id/decision', requirePermission('sales_quotes.price'), csrfProtection, validate(quoteDecideSchema),
  handle(async (req) => Q.decide(id(req), req.body, req.user, req)));

router.get('/sales/desk', requirePermission('leads.view'), handle(async (req) => S.desk(req.user, req.query)));
router.get('/sales/owners', requirePermission('leads.view'), handle(async () => ({ owners: await S.assignableOwners() })));
router.get('/sales/leads', requirePermission('leads.view'), handle(async (req) => S.listLeads(req.user, req.query)));
router.post('/sales/leads', requirePermission('leads.create'), csrfProtection, validate(leadSchema), handle(async (req) => S.createLead(req.body, req.user, req), 201));
router.get('/sales/leads/:id', requirePermission('leads.view'), handle(async (req) => S.getLead360(id(req), req.user)));
router.put('/sales/leads/:id', requirePermission('leads.update'), csrfProtection, validate(leadSchema), handle(async (req) => S.updateLeadDetails(id(req), req.body, req.user, req)));
router.delete('/sales/leads/:id', requirePermission('leads.delete'), csrfProtection, handle(async (req) => S.deleteLead(id(req), req.user, req)));
router.post('/sales/leads/:id/interactions', requirePermission('leads.update'), csrfProtection, validate(interactionSchema),
  handle(async (req) => S.logInteraction(id(req), req.body, req.user, req), 201));
router.put('/sales/leads/:id/owner', requirePermission('leads.update'), csrfProtection, validate(assignSchema),
  handle(async (req) => S.assignLead(id(req), req.body.ownerUserId, req.user, req)));
router.post('/sales/leads/:id/onboard', requirePermission('leads.convert'), csrfProtection, validate(onboardSchema),
  handle(async (req) => S.onboardLead(id(req), req.body, req.user, req)));

router.get('/sales/clients', requirePermission('leads.view'), handle(async (req) => ({ clients: await S.selectableClients(req.user) })));
router.get('/sales/services', requirePermission('proposals.view'), handle(async () => ({ services: await S.selectableServices() })));
router.get('/sales/marketers', requirePermission('leads.view'), handle(async (req) => S.marketers(req.user, req.query)));

router.get('/sales/meetings', requirePermission('leads.view'), handle(async (req) => S.listMeetings(req.user, req.query)));
router.post('/sales/meetings', requirePermission('leads.update'), csrfProtection, validate(meetingSchema), handle(async (req) => S.createMeeting(req.body, req.user, req), 201));
router.put('/sales/meetings/:id', requirePermission('leads.update'), csrfProtection, validate(meetingUpdateSchema),
  handle(async (req) => ({ meeting: await S.updateMeeting(id(req), req.body, req.user, req) })));

router.get('/sales/proposals', requirePermission('proposals.view'), handle(async (req) => S.listProposals(req.user, req.query)));
router.get('/sales/proposals/:id', requirePermission('proposals.view'), handle(async (req) => S.getProposal(id(req), req.user)));
router.post('/sales/proposals', requirePermission('proposals.create'), csrfProtection, validate(proposalSchema),
  handle(async (req) => S.saveProposal(null, req.body, req.user, req), 201));
router.put('/sales/proposals/:id', requirePermission('proposals.create'), csrfProtection, validate(proposalSchema),
  handle(async (req) => S.saveProposal(id(req), req.body, req.user, req)));
router.post('/sales/proposals/:id/withdraw', requirePermission('proposals.create'), csrfProtection, handle(async (req) => S.withdrawProposal(id(req), req.user, req)));
router.post('/sales/proposals/:id/duplicate', requirePermission('proposals.create'), csrfProtection, handle(async (req) => S.duplicateProposal(id(req), req.user, req), 201));
router.delete('/sales/proposals/:id', requirePermission('proposals.create'), csrfProtection, handle(async (req) => S.deleteProposal(id(req), req.user, req)));
router.post('/sales/proposals/:id/send', requirePermission('proposals.send'), csrfProtection, handle(async (req) => S.sendProposal(id(req), req.user, req)));
router.post('/sales/proposals/:id/convert', requirePermission('proposals.convert'), csrfProtection, validate(convertSchema),
  handle(async (req) => {
    const perms = req.user.permissions || [];
    if (!req.user.isOwner && !(perms.includes('projects.create') && perms.includes('invoices.create'))) {
      const e = new Error('Converting creates a project and an invoice; you need both permissions'); e.status = 403; throw e;
    }
    return S.convertProposal(id(req), req.body, req.user, req);
  }));

export default router;
