import { DeliverablesService } from './deliverables.service.js';

export class DeliverablesController {
  /**
   * Submit task deliverable for internal review
   */
  static async submitReview(req, res, next) {
    try {
      const taskId = req.params.id;
      const { title, deliverableType, deliverableUrl, submissionNotes } = req.body;
      const file = req.file || null;

      const submission = await DeliverablesService.submitForInternalReview(
        {
          taskId,
          title,
          deliverableType,
          deliverableUrl,
          file,
          submissionNotes
        },
        req.user,
        req
      );

      return res.status(201).json({
        success: true,
        message: 'Deliverable submitted for internal review successfully',
        data: { submission }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * AM / Internal Reviewer decision
   */
  static async reviewInternal(req, res, next) {
    try {
      const submissionId = req.params.id;
      const { decision, feedback } = req.body;

      const submission = await DeliverablesService.reviewInternal(
        submissionId,
        { decision, feedback },
        req.user,
        req
      );

      const msg = decision === 'approved'
        ? (submission.requires_client_approval ? 'Deliverable internally approved and submitted for client approval' : 'Deliverable approved and task completed internally')
        : 'Changes requested internally; task returned to employee for rework';

      return res.status(200).json({
        success: true,
        message: msg,
        data: { submission }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Client Portal: Approve deliverable
   */
  static async clientApprove(req, res, next) {
    try {
      const submissionId = req.params.id;
      const { feedback } = req.body;

      const submission = await DeliverablesService.clientApprove(
        submissionId,
        { feedback },
        req.user,
        req
      );

      return res.status(200).json({
        success: true,
        message: 'Deliverable approved by client successfully',
        data: { submission }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Client Portal: Request Revision
   */
  static async clientRequestRevision(req, res, next) {
    try {
      const submissionId = req.params.id;
      const { revisionReason } = req.body;

      const submission = await DeliverablesService.clientRequestRevision(
        submissionId,
        { revisionReason },
        req.user,
        req
      );

      return res.status(200).json({
        success: true,
        message: 'Revision requested successfully; employee notified for rework',
        data: { submission }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all submissions and revision history for a task
   */
  static async getTaskSubmissions(req, res, next) {
    try {
      const taskId = req.params.id;
      const submissions = await DeliverablesService.getTaskSubmissions(taskId, req.user);

      return res.status(200).json({
        success: true,
        data: { submissions }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single submission
   */
  static async getSubmissionById(req, res, next) {
    try {
      const submissionId = req.params.id;
      const submission = await DeliverablesService.getSubmissionById(submissionId);

      if (!submission) {
        return res.status(404).json({
          success: false,
          error: { message: 'Submission not found', code: 'SUBMISSION_NOT_FOUND' }
        });
      }

      // If actor is client: check isolation and internal approval
      if (req.user.client_id) {
        if (Number(req.user.client_id) !== Number(submission.client_id)) {
          return res.status(403).json({
            success: false,
            error: { message: 'Access denied to another client\'s deliverable', code: 'ACCESS_DENIED' }
          });
        }
        if (submission.internal_review_status !== 'approved' || !submission.requires_client_approval) {
          return res.status(403).json({
            success: false,
            error: { message: 'Deliverable not available for client viewing', code: 'DELIVERABLE_NOT_AVAILABLE' }
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: { submission }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Client Portal: List deliverables for client
   */
  static async getClientDeliverables(req, res, next) {
    try {
      const clientId = req.params.id;
      const { status } = req.query;

      const deliverables = await DeliverablesService.getClientDeliverables(clientId, req.user, { status });

      return res.status(200).json({
        success: true,
        data: { deliverables }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Account Manager / Reviewer Queue
   */
  static async getReviewQueue(req, res, next) {
    try {
      const queue = await DeliverablesService.getReviewQueue(req.user);

      return res.status(200).json({
        success: true,
        data: queue
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Secure deliverable file download
   */
  static async downloadFile(req, res, next) {
    try {
      const submissionId = req.params.id;
      const fileInfo = await DeliverablesService.getDeliverableFile(submissionId, req.user);

      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`);
      return res.sendFile(fileInfo.filePath);
    } catch (err) {
      next(err);
    }
  }
}
