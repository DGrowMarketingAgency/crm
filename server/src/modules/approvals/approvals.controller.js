import { ApprovalsService } from './approvals.service.js';
import { submitReviewSchema, approveSchema, requestRevisionSchema } from './approvals.validation.js';

export class ApprovalsController {
  static async submitReview(req, res, next) {
    try {
      const taskId = req.params.id;
      const validated = submitReviewSchema.parse(req.body);

      const approval = await ApprovalsService.submitReview(
        taskId,
        req.user,
        validated,
        req
      );

      res.status(201).json({
        message: 'Task submitted for review successfully',
        approval
      });
    } catch (err) {
      next(err);
    }
  }

  static async getApprovals(req, res, next) {
    try {
      const taskId = req.params.id;
      const approvals = await ApprovalsService.getApprovals(taskId, req.user);

      res.status(200).json({ approvals });
    } catch (err) {
      next(err);
    }
  }

  static async approve(req, res, next) {
    try {
      const { approvalId } = req.params;
      const validated = approveSchema.parse(req.body);

      const approval = await ApprovalsService.approve(
        approvalId,
        req.user,
        validated,
        req
      );

      res.status(200).json({
        message: 'Task submission approved successfully',
        approval
      });
    } catch (err) {
      next(err);
    }
  }

  static async requestRevision(req, res, next) {
    try {
      const { approvalId } = req.params;
      const validated = requestRevisionSchema.parse(req.body);

      const approval = await ApprovalsService.requestRevision(
        approvalId,
        req.user,
        validated,
        req
      );

      res.status(200).json({
        message: 'Revisions requested successfully',
        approval
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancel(req, res, next) {
    try {
      const { approvalId } = req.params;
      const approval = await ApprovalsService.cancel(approvalId, req.user, req);

      res.status(200).json({
        message: 'Review request cancelled successfully',
        approval
      });
    } catch (err) {
      next(err);
    }
  }

  static async getApprovalHistory(req, res, next) {
    try {
      const taskId = req.params.id;
      const history = await ApprovalsService.getApprovalHistory(taskId, req.user);

      res.status(200).json({ history });
    } catch (err) {
      next(err);
    }
  }
}
