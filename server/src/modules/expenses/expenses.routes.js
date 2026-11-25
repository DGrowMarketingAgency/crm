import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../utils/csrf.js';
import { isClientPortalUser } from '../project-flow/projectFlow.service.js';
import { ExpensesService as E } from './expenses.service.js';
import { LoansService as L } from './loans.service.js';
import { AdFundsService as A } from './adfunds.service.js';
import { BorrowingsService as B } from './borrowings.service.js';
import {
  categorySchema, subcategorySchema, expenseSchema, markPaidSchema, loanSchema, closeLoanSchema, payEmiSchema,
  adTxnSchema, dailySpendSchema, campaignSchema, walletSettingsSchema, borrowingSchema, borrowingReturnSchema
} from './expenses.validation.js';

const router = Router();

const staffOnly = (req, res, next) => {
  if (isClientPortalUser(req.user)) return res.status(403).json({ success: false, error: { message: 'Not available for client accounts', code: 'FORBIDDEN' } });
  next();
};
router.use(['/expenses', '/loans', '/ad-funds', '/borrowings'], authenticate, staffOnly);

const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (e) {
    next(e);
  }
};
const id = (req, k = 'id') => Number(req.params[k]);
const VIEW = requirePermission('expenses.view');
const MANAGE = [requirePermission('expenses.manage'), csrfProtection];
const AD_VIEW = requirePermission('adfunds.view');
const AD_MANAGE = [requirePermission('adfunds.manage'), csrfProtection];

router.get('/expenses/lookups', requirePermission(['expenses.view', 'adfunds.view']), handle(async () => E.lookups()));

// Categories
router.get('/expenses/categories', requirePermission(['expenses.view', 'adfunds.view']), handle(async () => ({ categories: await E.categories() })));
router.post('/expenses/categories', ...MANAGE, validate(categorySchema), handle(async (req) => ({ categories: await E.addCategory(req.body, req.user, req) }), 201));
router.post('/expenses/categories/:id/subcategories', ...MANAGE, validate(subcategorySchema),
  handle(async (req) => ({ categories: await E.addSubcategory(id(req), req.body, req.user, req) }), 201));

// Expenses & purchases
router.get('/expenses', VIEW, handle(async (req) => E.list(req.query)));
router.post('/expenses', ...MANAGE, validate(expenseSchema), handle(async (req) => ({ expense: await E.create(req.body, req.user, req) }), 201));
router.get('/expenses/:id', VIEW, handle(async (req) => ({ expense: await E.get(id(req)) })));
router.put('/expenses/:id', ...MANAGE, validate(expenseSchema), handle(async (req) => ({ expense: await E.update(id(req), req.body, req.user, req) })));
router.post('/expenses/:id/paid', ...MANAGE, validate(markPaidSchema), handle(async (req) => ({ expense: await E.markPaid(id(req), req.body, req.user, req) })));
router.delete('/expenses/:id', ...MANAGE, handle(async (req) => E.remove(id(req), req.user, req)));

// EMI & loans
router.get('/loans', VIEW, handle(async (req) => L.list({ status: String(req.query.status || '') })));
router.get('/loans/dues', VIEW, handle(async (req) => L.dues({ month: String(req.query.month || '') })));
router.post('/loans', ...MANAGE, validate(loanSchema), handle(async (req) => L.create(req.body, req.user, req), 201));
router.get('/loans/:id', VIEW, handle(async (req) => L.get(id(req))));
router.put('/loans/:id', ...MANAGE, validate(loanSchema), handle(async (req) => L.update(id(req), req.body, req.user, req)));
router.delete('/loans/:id', ...MANAGE, handle(async (req) => L.remove(id(req), req.user, req)));
router.post('/loans/:id/close', ...MANAGE, validate(closeLoanSchema), handle(async (req) => L.close(id(req), req.body, req.user, req)));
router.post('/loans/:id/reopen', ...MANAGE, handle(async (req) => L.reopen(id(req), req.user, req)));
router.post('/loans/installments/:id/pay', ...MANAGE, validate(payEmiSchema), handle(async (req) => L.pay(id(req), req.body, req.user, req)));
router.post('/loans/installments/:id/undo', ...MANAGE, handle(async (req) => L.undoPayment(id(req), req.user, req)));

// Client ad funds
// Borrowed money (same access as expenses)
router.get('/borrowings', VIEW, handle(async (req) => B.list({ status: String(req.query.status || ''), search: String(req.query.search || '') })));
router.post('/borrowings', ...MANAGE, validate(borrowingSchema), handle(async (req) => B.create(req.body, req.user, req), 201));
router.get('/borrowings/:id', VIEW, handle(async (req) => B.get(id(req))));
router.put('/borrowings/:id', ...MANAGE, validate(borrowingSchema), handle(async (req) => B.update(id(req), req.body, req.user, req)));
router.delete('/borrowings/:id', ...MANAGE, handle(async (req) => B.remove(id(req), req.user, req)));
router.post('/borrowings/:id/returns', ...MANAGE, validate(borrowingReturnSchema), handle(async (req) => B.addReturn(id(req), req.body, req.user, req), 201));
router.delete('/borrowings/returns/:id', ...MANAGE, handle(async (req) => B.removeReturn(id(req), req.user, req)));

router.get('/ad-funds/summary', AD_VIEW, handle(async (req) => A.summary(req.query)));
router.get('/ad-funds/transactions', AD_VIEW, handle(async (req) => ({ transactions: await A.transactions(req.query) })));
router.post('/ad-funds/transactions', ...AD_MANAGE, validate(adTxnSchema), handle(async (req) => A.record(req.body, req.user, req), 201));
router.post('/ad-funds/daily-spend', ...AD_MANAGE, validate(dailySpendSchema), handle(async (req) => A.recordDailySpend(req.body, req.user, req), 201));
router.delete('/ad-funds/transactions/:id', ...AD_MANAGE, handle(async (req) => A.removeTxn(id(req), req.user, req)));
router.get('/ad-funds/campaigns', AD_VIEW, handle(async (req) => ({ campaigns: await A.campaigns({ clientId: req.query.clientId }) })));
router.post('/ad-funds/campaigns', ...AD_MANAGE, validate(campaignSchema), handle(async (req) => ({ campaign: await A.saveCampaign(null, req.body, req.user, req) }), 201));
router.put('/ad-funds/campaigns/:id', ...AD_MANAGE, validate(campaignSchema), handle(async (req) => ({ campaign: await A.saveCampaign(id(req), req.body, req.user, req) })));
router.delete('/ad-funds/campaigns/:id', ...AD_MANAGE, handle(async (req) => A.removeCampaign(id(req), req.user, req)));
router.get('/ad-funds/clients/:id/settings', AD_VIEW, handle(async (req) => ({ settings: await A.settings(id(req)) })));
router.put('/ad-funds/clients/:id/settings', ...AD_MANAGE, validate(walletSettingsSchema),
  handle(async (req) => ({ settings: await A.saveSettings(id(req), req.body, req.user, req) })));
router.get('/ad-funds/clients/:id/statement', AD_VIEW, handle(async (req) => A.statement(id(req), { from: req.query.from, to: req.query.to })));

export default router;
