import { Router } from 'express';
import { ApprovalsController } from './approvals.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.post(
  '/tasks/:id/submit-review',
  requirePermission('approvals.submit'),
  ApprovalsController.submitReview
);

router.get(
  '/tasks/:id/approvals',
  requirePermission('approvals.view'),
  ApprovalsController.getApprovals
);

router.post(
  '/tasks/:id/approvals/:approvalId/approve',
  requirePermission('approvals.approve'),
  ApprovalsController.approve
);

router.post(
  '/tasks/:id/approvals/:approvalId/request-revision',
  requirePermission('approvals.request_revision'),
  ApprovalsController.requestRevision
);

router.post(
  '/tasks/:id/approvals/:approvalId/cancel',
  requirePermission('approvals.cancel'),
  ApprovalsController.cancel
);

router.get(
  '/tasks/:id/approval-history',
  requirePermission('approvals.view'),
  ApprovalsController.getApprovalHistory
);

export default router;
