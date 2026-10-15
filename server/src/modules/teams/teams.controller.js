import { TeamsService } from './teams.service.js';

export class TeamsController {
  static async listTeams(req, res, next) {
    try {
      const result = await TeamsService.listTeams({
        search: req.query.search || '',
        status: req.query.status || '',
        limit: Number(req.query.limit) || 20,
        offset: Number(req.query.offset) || 0
      });
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getTeam(req, res, next) {
    try {
      const team = await TeamsService.getTeamById(req.params.id);
      res.status(200).json({ success: true, team });
    } catch (err) {
      next(err);
    }
  }

  static async createTeam(req, res, next) {
    try {
      const team = await TeamsService.createTeam(req.body, req.user, req);
      res.status(201).json({ success: true, team });
    } catch (err) {
      next(err);
    }
  }

  static async updateTeam(req, res, next) {
    try {
      const team = await TeamsService.updateTeam(req.params.id, req.body, req.user, req);
      res.status(200).json({ success: true, team });
    } catch (err) {
      next(err);
    }
  }

  static async deleteTeam(req, res, next) {
    try {
      await TeamsService.deleteTeam(req.params.id, req.user, req);
      res.status(200).json({ success: true, message: 'Team deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async getTeamMembers(req, res, next) {
    try {
      const members = await TeamsService.getTeamMembers(req.params.id);
      res.status(200).json({ success: true, members });
    } catch (err) {
      next(err);
    }
  }

  static async addMember(req, res, next) {
    try {
      const result = await TeamsService.addTeamMember(req.params.id, req.body, req.user, req);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async removeMember(req, res, next) {
    try {
      await TeamsService.removeTeamMember(req.params.id, req.params.userId, req.user, req);
      res.status(200).json({ success: true, message: 'Member removed from team successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async assignLeader(req, res, next) {
    try {
      const result = await TeamsService.assignTeamLeader(req.params.id, req.body.leaderId, req.user, req);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}
