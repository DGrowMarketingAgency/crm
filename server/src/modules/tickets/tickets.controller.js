import { TicketsService } from './tickets.service.js';

export class TicketsController {
  static async createTicket(req, res, next) {
    try {
      const ticket = await TicketsService.createTicket(req.user, req.body);
      return res.status(201).json({ success: true, ticket });
    } catch (err) {
      next(err);
    }
  }

  static async listTickets(req, res, next) {
    try {
      const tickets = await TicketsService.listTickets(req.user, req.query);
      return res.status(200).json({ success: true, tickets });
    } catch (err) {
      next(err);
    }
  }

  static async getTicketDetails(req, res, next) {
    try {
      const data = await TicketsService.getTicketDetails(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async addMessage(req, res, next) {
    try {
      const data = await TicketsService.addMessage(req.user, req.params.id, req.body);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async updateTicket(req, res, next) {
    try {
      const data = await TicketsService.updateTicket(req.user, req.params.id, req.body);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async getTicketStats(req, res, next) {
    try {
      const stats = await TicketsService.getTicketStats(req.user);
      return res.status(200).json({ success: true, stats });
    } catch (err) {
      next(err);
    }
  }
}
