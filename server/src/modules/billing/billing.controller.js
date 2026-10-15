import { BillingService } from './billing.service.js';

export class BillingController {
  // Quotations
  static async createQuotation(req, res, next) {
    try {
      const data = await BillingService.createQuotation(req.user, req.body);
      return res.status(201).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async listQuotations(req, res, next) {
    try {
      const quotations = await BillingService.listQuotations(req.user, req.query);
      return res.status(200).json({ success: true, quotations });
    } catch (err) {
      next(err);
    }
  }

  static async getQuotationDetails(req, res, next) {
    try {
      const data = await BillingService.getQuotationDetails(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async issueQuotation(req, res, next) {
    try {
      const data = await BillingService.issueQuotation(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async clientReviewQuotation(req, res, next) {
    try {
      const data = await BillingService.clientReviewQuotation(req.user, req.params.id, req.body);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async convertQuotationToInvoice(req, res, next) {
    try {
      const data = await BillingService.convertQuotationToInvoice(req.user, req.params.id);
      return res.status(201).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  // Invoices
  static async createInvoice(req, res, next) {
    try {
      const data = await BillingService.createInvoice(req.user, req.body);
      return res.status(201).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async listInvoices(req, res, next) {
    try {
      const invoices = await BillingService.listInvoices(req.user, req.query);
      return res.status(200).json({ success: true, invoices });
    } catch (err) {
      next(err);
    }
  }

  static async getInvoiceDetails(req, res, next) {
    try {
      const data = await BillingService.getInvoiceDetails(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async issueInvoice(req, res, next) {
    try {
      const data = await BillingService.issueInvoice(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async voidInvoice(req, res, next) {
    try {
      const data = await BillingService.voidInvoice(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  // Payments
  static async recordPayment(req, res, next) {
    try {
      const data = await BillingService.recordPayment(req.user, req.params.id, req.body);
      return res.status(201).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async getPaymentReceipt(req, res, next) {
    try {
      const receipt = await BillingService.getPaymentReceipt(req.user, req.params.id);
      return res.status(200).json({ success: true, receipt });
    } catch (err) {
      next(err);
    }
  }

  static async getBillingStats(req, res, next) {
    try {
      const stats = await BillingService.getBillingStats(req.user);
      return res.status(200).json({ success: true, stats });
    } catch (err) {
      next(err);
    }
  }

  // Document download / print
  static async getDocumentHtml(req, res, next) {
    try {
      const html = await BillingService.generateDocumentHtml(req.user, req.params.type, req.params.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err) {
      next(err);
    }
  }
}
