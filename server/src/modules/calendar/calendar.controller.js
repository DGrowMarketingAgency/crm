import { CalendarService } from './calendar.service.js';
import {
  createEventSchema,
  updateEventSchema,
  listEventsQuerySchema,
  publishEventSchema
} from './calendar.validation.js';

export class CalendarController {
  /**
   * GET /api/calendar
   */
  static async getEvents(req, res, next) {
    try {
      const validatedQuery = listEventsQuerySchema.parse(req.query);
      const events = await CalendarService.getEvents(validatedQuery, req.user);
      res.json({
        success: true,
        data: events,
        count: events.length
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/calendar/options
   */
  static async getFilterOptions(req, res, next) {
    try {
      const options = await CalendarService.getFilterOptions(req.user);
      res.json({
        success: true,
        data: options
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/calendar/:id
   */
  static async getEventById(req, res, next) {
    try {
      const event = await CalendarService.getEventById(req.params.id, req.user);
      res.json({
        success: true,
        data: event
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/calendar
   */
  static async createEvent(req, res, next) {
    try {
      const validatedData = createEventSchema.parse(req.body);
      const event = await CalendarService.createEvent(validatedData, req.user, req);
      res.status(201).json({
        success: true,
        data: event,
        message: 'Calendar event created successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/calendar/:id
   */
  static async updateEvent(req, res, next) {
    try {
      const validatedData = updateEventSchema.parse(req.body);
      const updatedEvent = await CalendarService.updateEvent(req.params.id, validatedData, req.user);
      res.json({
        success: true,
        data: updatedEvent,
        message: 'Calendar event updated successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/calendar/:id
   */
  static async deleteEvent(req, res, next) {
    try {
      const deleteScope = req.query.deleteScope || 'single';
      const result = await CalendarService.deleteEvent(req.params.id, { deleteScope }, req.user);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/calendar/:id/publish
   */
  static async publishEvent(req, res, next) {
    try {
      const validatedData = publishEventSchema.parse(req.body);
      const publishedEvent = await CalendarService.recordPublication(req.params.id, validatedData, req.user);
      res.json({
        success: true,
        data: publishedEvent,
        message: 'Publication recorded successfully'
      });
    } catch (err) {
      next(err);
    }
  }
}
