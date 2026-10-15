import { LeadsService } from './leads.service.js';

export class LeadsController {
  static async listLeads(req, res, next) {
    try {
      const {
        stage = '',
        ownerUserId = '',
        search = '',
        limit = 50,
        offset = 0
      } = req.query;
      const pipelineEntity = req.query.pipelineEntity || req.query.pipeline || '';

      const result = await LeadsService.listLeads(
        {
          pipelineEntity,
          stage,
          ownerUserId,
          search,
          limit: Number(limit) || 50,
          offset: Number(offset) || 0
        },
        req.user
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getLead(req, res, next) {
    try {
      const lead = await LeadsService.getLeadById(Number(req.params.id), req.user);
      res.json({ lead });
    } catch (err) {
      next(err);
    }
  }

  static async createLead(req, res, next) {
    try {
      const lead = await LeadsService.createLead(req.body, req.user, req);
      res.status(201).json({ message: 'Lead created successfully', lead });
    } catch (err) {
      next(err);
    }
  }

  static async updateLead(req, res, next) {
    try {
      const lead = await LeadsService.updateLead(Number(req.params.id), req.body, req.user, req);
      res.json({ message: 'Lead updated successfully', lead });
    } catch (err) {
      next(err);
    }
  }

  static async convertLead(req, res, next) {
    try {
      const result = await LeadsService.convertLead(
        Number(req.params.id),
        req.body,
        req.user,
        req
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

