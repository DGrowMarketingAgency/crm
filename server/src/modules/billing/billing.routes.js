import { Router } from 'express';
import { BillingController } from './billing.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// Billing overview stats
router.get('/billing/stats', requirePermission(['invoices.view', 'quotations.view']), BillingController.getBillingStats);

// Printable/PDF Document HTML
router.get('/billing/documents/:type/:id', requirePermission(['invoices.view', 'quotations.view', 'payments.view']), BillingController.getDocumentHtml);

// Quotations
router.get('/quotations', requirePermission('quotations.view'), BillingController.listQuotations);
router.post('/quotations', requirePermission('quotations.create'), BillingController.createQuotation);
router.get('/quotations/:id', requirePermission('quotations.view'), BillingController.getQuotationDetails);
router.post('/quotations/:id/issue', requirePermission('quotations.issue'), BillingController.issueQuotation);
router.post('/quotations/:id/review', requirePermission('quotations.review_client'), BillingController.clientReviewQuotation);
router.post('/quotations/:id/convert', requirePermission('quotations.convert'), BillingController.convertQuotationToInvoice);

// Invoices
router.get('/invoices', requirePermission('invoices.view'), BillingController.listInvoices);
router.post('/invoices', requirePermission('invoices.create'), BillingController.createInvoice);
router.get('/invoices/:id', requirePermission('invoices.view'), BillingController.getInvoiceDetails);
router.post('/invoices/:id/issue', requirePermission('invoices.issue'), BillingController.issueInvoice);
router.post('/invoices/:id/void', requirePermission('invoices.void'), BillingController.voidInvoice);

// Payments
router.post('/invoices/:id/payments', requirePermission('payments.record'), BillingController.recordPayment);
router.get('/payments/:id/receipt', requirePermission('payments.view'), BillingController.getPaymentReceipt);

export default router;
