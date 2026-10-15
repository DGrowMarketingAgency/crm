import { Router } from 'express';
import { DeliverablesController } from './deliverables.controller.js';
import { deliverableUpload } from './deliverables.upload.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// 1. Submit task work for internal review (Employee)
router.post(
  '/tasks/:id/deliverables/submit-review',
  requirePermission('deliverables.submit'),
  deliverableUpload.single('file'),
  DeliverablesController.submitReview
);

// 2. Get all submissions and revision cycles for a task
router.get(
  '/tasks/:id/deliverables',
  requirePermission('deliverables.view'),
  DeliverablesController.getTaskSubmissions
);

// 3. Internal review decision: Approve or Request Changes (Account Manager / Reviewer)
router.post(
  '/deliverables/:id/review-internal',
  requirePermission('deliverables.review_internal'),
  DeliverablesController.reviewInternal
);

// 4. Client approval in portal (Client)
router.post(
  '/deliverables/:id/client-approve',
  requirePermission('deliverables.review_client'),
  DeliverablesController.clientApprove
);

// 5. Client request revision with mandatory reason (Client)
router.post(
  '/deliverables/:id/client-request-revision',
  requirePermission('deliverables.request_revision'),
  DeliverablesController.clientRequestRevision
);

// 6. Get single deliverable details
router.get(
  '/deliverables/:id',
  requirePermission('deliverables.view'),
  DeliverablesController.getSubmissionById
);

// 7. Download deliverable file securely
router.get(
  '/deliverables/:id/download',
  requirePermission('deliverables.view'),
  DeliverablesController.downloadFile
);

// 8. List client deliverables for portal (Client / AM)
router.get(
  '/clients/:id/deliverables',
  requirePermission('deliverables.view'),
  DeliverablesController.getClientDeliverables
);

// 9. Account Manager / Reviewer Queue
router.get(
  '/am/approvals-queue',
  requirePermission('deliverables.review_internal'),
  DeliverablesController.getReviewQueue
);

export default router;
