import { MilestonesService } from './milestones.service.js';

export class MilestonesController {
  static async listMilestones(req, res, next) {
    try {
      const milestones = await MilestonesService.listMilestones(req.params.id, req.user);
      res.json({ milestones });
    } catch (err) {
      next(err);
    }
  }

  static async createMilestone(req, res, next) {
    try {
      const milestone = await MilestonesService.createMilestone(req.params.id, req.body, req.user, req);
      res.status(201).json({ message: 'Milestone created successfully', milestone });
    } catch (err) {
      next(err);
    }
  }

  static async updateMilestone(req, res, next) {
    try {
      const milestone = await MilestonesService.updateMilestone(
        req.params.id,
        req.params.milestoneId,
        req.body,
        req.user,
        req
      );
      res.json({ message: 'Milestone updated successfully', milestone });
    } catch (err) {
      next(err);
    }
  }

  static async changeMilestoneStatus(req, res, next) {
    try {
      const milestone = await MilestonesService.changeMilestoneStatus(
        req.params.id,
        req.params.milestoneId,
        req.body.status,
        req.user,
        req
      );
      res.json({ message: 'Milestone status updated successfully', milestone });
    } catch (err) {
      next(err);
    }
  }

  static async deleteMilestone(req, res, next) {
    try {
      await MilestonesService.deleteMilestone(req.params.id, req.params.milestoneId, req.user, req);
      res.json({ message: 'Milestone deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async reorderMilestones(req, res, next) {
    try {
      const milestones = await MilestonesService.reorderMilestones(
        req.params.id,
        req.body.orders,
        req.user,
        req
      );
      res.json({ message: 'Milestones reordered successfully', milestones });
    } catch (err) {
      next(err);
    }
  }
}
