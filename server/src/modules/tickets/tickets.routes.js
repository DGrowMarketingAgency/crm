import { Router } from 'express';
import { TicketsController } from './tickets.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// Ticket statistics
router.get('/tickets/stats', requirePermission('tickets.view'), TicketsController.getTicketStats);

// List tickets
router.get('/tickets', requirePermission('tickets.view'), TicketsController.listTickets);

// Create ticket
router.post('/tickets', requirePermission('tickets.create'), TicketsController.createTicket);

// Single ticket details
router.get('/tickets/:id', requirePermission('tickets.view'), TicketsController.getTicketDetails);

// Add reply or internal note
router.post('/tickets/:id/messages', requirePermission('tickets.reply'), TicketsController.addMessage);

// Update status / priority / assignment
router.patch('/tickets/:id', requirePermission(['tickets.update', 'tickets.resolve']), TicketsController.updateTicket);

export default router;
