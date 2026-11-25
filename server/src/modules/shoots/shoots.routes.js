import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { ShootsService } from './shoots.service.js';
import {
  addAvailabilitySchema,
  clearDaySchema,
  submitMonthSchema,
  addVideographerSchema,
  updateVideographerSchema,
  monthQuerySchema,
  createSlotSchema,
  updateSlotSchema,
  reasonSchema,
  assignSchema,
  slotListQuerySchema,
  freeQuerySchema,
  mineQuerySchema,
  createProposalSchema,
  respondProposalSchema,
  proposalListQuerySchema,
  attendanceSchema,
  footageSchema,
  payPayoutSchema,
  payoutListQuerySchema,
  clientProjectsQuerySchema
} from './shoots.validation.js';
import { ShootDeliveryService } from './shootDelivery.service.js';
import { ShootSlotsService } from './shootSlots.service.js';
import { ShootProposalsService } from './shootProposals.service.js';

const router = Router();
router.use(authenticate);

/** Wraps a service call: `fn(req)` → `{ success, data }`. */
const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json({ success: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};

const ownCalendar = requirePermission(['shoots.availability', 'shoots.manage']);
const viewTeam = requirePermission(['shoots.view', 'shoots.manage']);
const manageTeam = requirePermission('shoots.manage');

// ── A videographer's own monthly availability (managers may pass ?userId= / body.userId) ──
router.get('/availability', ownCalendar, validate(monthQuerySchema, 'query'), handle((req) =>
  ShootsService.getAvailability(req.user, req.query)
));
router.post('/availability', ownCalendar, validate(addAvailabilitySchema), handle((req) =>
  ShootsService.addAvailability(req.user, req.body, req), 201
));
router.post('/availability/clear-day', ownCalendar, validate(clearDaySchema), handle((req) =>
  ShootsService.clearDay(req.user, req.body, req)
));
router.post('/availability/submit', ownCalendar, validate(submitMonthSchema), handle((req) =>
  ShootsService.submitMonth(req.user, req.body)
));
router.delete('/availability/:id', ownCalendar, handle((req) =>
  ShootsService.removeAvailability(req.user, Number(req.params.id), req)
));

// ── Managers: who is free, and the videographer list ──
router.get('/board', viewTeam, validate(monthQuerySchema, 'query'), handle((req) => ShootsService.board(req.user, req.query)));
router.get('/videographers', viewTeam, validate(monthQuerySchema, 'query'), handle((req) =>
  ShootsService.listVideographers(req.user, req.query)
));
router.get('/videographers/candidates', manageTeam, handle((req) => ShootsService.candidateStaff(req.user)));
router.post('/videographers', manageTeam, validate(addVideographerSchema), handle((req) =>
  ShootsService.addVideographer(req.user, req.body, req), 201
));
router.patch('/videographers/:userId', manageTeam, validate(updateVideographerSchema), handle((req) =>
  ShootsService.updateVideographer(req.user, Number(req.params.userId), req.body, req)
));

// ── Shoot slots: managers post them, videographers accept (first come, first served) ──
const videographer = requirePermission('shoots.availability');

router.get('/slots', viewTeam, validate(slotListQuerySchema, 'query'), handle((req) => ShootSlotsService.listSlots(req.user, req.query)));
router.get('/slots/free', viewTeam, validate(freeQuerySchema, 'query'), handle((req) => ShootSlotsService.whoIsFree(req.user, req.query)));
router.get('/slots/open', videographer, handle((req) => ShootSlotsService.openSlots(req.user)));
router.get('/slots/mine', videographer, validate(mineQuerySchema, 'query'), handle((req) => ShootSlotsService.mySlots(req.user, req.query)));
router.get('/slots/:id', requirePermission(['shoots.view', 'shoots.manage', 'shoots.availability']), handle((req) =>
  ShootSlotsService.getSlot(req.user, Number(req.params.id))
));
router.post('/slots', manageTeam, validate(createSlotSchema), handle((req) => ShootSlotsService.createSlot(req.user, req.body, req), 201));
router.patch('/slots/:id', manageTeam, validate(updateSlotSchema), handle((req) =>
  ShootSlotsService.updateSlot(req.user, Number(req.params.id), req.body, req)
));
router.post('/slots/:id/cancel', manageTeam, validate(reasonSchema), handle((req) =>
  ShootSlotsService.cancelSlot(req.user, Number(req.params.id), req.body, req)
));
router.post('/slots/:id/assign', manageTeam, validate(assignSchema), handle((req) =>
  ShootSlotsService.assign(req.user, Number(req.params.id), req.body.userId, req)
));
router.post('/slots/:id/unassign', manageTeam, validate(assignSchema), handle((req) =>
  ShootSlotsService.unassign(req.user, Number(req.params.id), req.body.userId, req.body, req)
));
router.post('/slots/:id/attendance', manageTeam, validate(attendanceSchema), handle((req) =>
  ShootSlotsService.markAttendance(req.user, Number(req.params.id), req.body, req)
));

// ── Date proposals: team offers options, the client picks one in the portal ──
const clientPortal = requirePermission('shoots.respond');
router.get('/proposals', viewTeam, validate(proposalListQuerySchema, 'query'), handle((req) => ShootProposalsService.list(req.user, req.query)));
router.post('/proposals', manageTeam, validate(createProposalSchema), handle((req) => ShootProposalsService.create(req.user, req.body, req), 201));
router.post('/proposals/:id/withdraw', manageTeam, handle((req) => ShootProposalsService.withdraw(req.user, Number(req.params.id), req)));
router.get('/client/proposals', clientPortal, handle((req) => ShootProposalsService.listForClient(req.user)));
router.post('/client/proposals/:id/respond', clientPortal, validate(respondProposalSchema), handle((req) =>
  ShootProposalsService.respond(req.user, Number(req.params.id), req.body, req)
));
router.get('/proposals/:id', requirePermission(['shoots.view', 'shoots.manage', 'shoots.respond']), handle((req) =>
  ShootProposalsService.get(req.user, Number(req.params.id))
));

router.post('/slots/:id/accept', videographer, handle((req) => ShootSlotsService.accept(req.user, Number(req.params.id), req)));
router.post('/slots/:id/withdraw', videographer, validate(reasonSchema), handle((req) =>
  ShootSlotsService.withdraw(req.user, Number(req.params.id), req.body, req)
));

// ── After the shoot: footage handoff + freelancer payouts (Phase 4) ──
router.get('/client-projects', viewTeam, validate(clientProjectsQuerySchema, 'query'), handle((req) =>
  ShootDeliveryService.clientProjects(req.user, req.query.clientId)
));
router.post('/slots/:id/footage', videographer, validate(footageSchema), handle((req) =>
  ShootDeliveryService.submitFootage(req.user, Number(req.params.id), req.body, req)
));
router.get('/payouts', manageTeam, validate(payoutListQuerySchema, 'query'), handle((req) => ShootDeliveryService.listPayouts(req.user, req.query)));
router.post('/payouts/:bookingId/pay', manageTeam, validate(payPayoutSchema), handle((req) =>
  ShootDeliveryService.markPaid(req.user, Number(req.params.bookingId), req.body, req)
));
router.get('/my-payouts', videographer, handle((req) => ShootDeliveryService.myPayouts(req.user)));

export default router;
