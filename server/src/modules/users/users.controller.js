import { UsersService } from './users.service.js';

export class UsersController {
  static async listUsers(req, res, next) {
    try {
      const result = await UsersService.listUsers({
        search: req.query.search || '',
        role: req.query.role || '',
        status: req.query.status || '',
        limit: Number(req.query.limit) || 20,
        offset: Number(req.query.offset) || 0,
        sort: req.query.sort || 'created_at',
        order: req.query.order || 'DESC'
      });
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getUser(req, res, next) {
    try {
      const user = await UsersService.getUserById(req.params.id);
      res.status(200).json({ success: true, user });
    } catch (err) {
      next(err);
    }
  }

  static async createUser(req, res, next) {
    try {
      const user = await UsersService.createUser(req.body, req.user, req);
      res.status(201).json({ success: true, user });
    } catch (err) {
      next(err);
    }
  }

  static async updateUser(req, res, next) {
    try {
      const user = await UsersService.updateUser(req.params.id, req.body, req.user, req);
      res.status(200).json({ success: true, user });
    } catch (err) {
      next(err);
    }
  }

  static async changeStatus(req, res, next) {
    try {
      const result = await UsersService.changeUserStatus(req.params.id, req.body.status, req.user, req);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getUserTeams(req, res, next) {
    try {
      const teams = await UsersService.getUserTeams(req.params.id);
      res.status(200).json({ success: true, teams });
    } catch (err) {
      next(err);
    }
  }

  static async createInvitation(req, res, next) {
    try {
      const invitation = await UsersService.createInvitation(req.body, req.user, req);
      res.status(201).json({ success: true, invitation });
    } catch (err) {
      next(err);
    }
  }

  static async listInvitations(req, res, next) {
    try {
      const invitations = await UsersService.listInvitations();
      res.status(200).json({ success: true, invitations });
    } catch (err) {
      next(err);
    }
  }

  static async resendInvitation(req, res, next) {
    try {
      const invitation = await UsersService.resendInvitation(req.params.id, req.user, req);
      res.status(200).json({ success: true, invitation });
    } catch (err) {
      next(err);
    }
  }

  static async revokeInvitation(req, res, next) {
    try {
      await UsersService.revokeInvitation(req.params.id, req.user, req);
      res.status(200).json({ success: true, message: 'Invitation revoked successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async acceptInvitation(req, res, next) {
    try {
      const result = await UsersService.acceptInvitation(req.body.token, req.body.password, req);
      res.status(200).json({
        success: true,
        message: 'Account activated successfully. You may now sign in.',
        user: result
      });
    } catch (err) {
      next(err);
    }
  }
}
