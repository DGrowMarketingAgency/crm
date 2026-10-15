import { TimeService } from './time.service.js';
import {
  startTimerSchema,
  stopTimerSchema,
  createTimeEntrySchema,
  updateTimeEntrySchema,
  createTimesheetSchema,
  rejectTimesheetSchema
} from './time.validation.js';

export class TimeController {
  // ==========================================
  // TIMERS
  // ==========================================

  static async startTimer(req, res, next) {
    try {
      const validated = startTimerSchema.parse(req.body);
      const timer = await TimeService.startTimer(req.user.id, validated, req.user, req);
      res.status(201).json({
        message: 'Task timer started successfully',
        timer
      });
    } catch (err) {
      next(err);
    }
  }

  static async stopTimer(req, res, next) {
    try {
      const { id } = req.params;
      const validated = stopTimerSchema.parse(req.body);
      const timeEntry = await TimeService.stopTimer(id, req.user.id, validated, req.user, req);
      res.status(200).json({
        message: 'Task timer stopped and logged as draft work entry',
        timeEntry
      });
    } catch (err) {
      next(err);
    }
  }

  static async getActiveTimer(req, res, next) {
    try {
      const timer = await TimeService.getActiveTimer(req.user.id);
      res.status(200).json({ timer });
    } catch (err) {
      next(err);
    }
  }

  static async getTimer(req, res, next) {
    try {
      const { id } = req.params;
      const timer = await TimeService.getTimerById(id, req.user);
      res.status(200).json({ timer });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // TIME ENTRIES
  // ==========================================

  static async getTimeEntries(req, res, next) {
    try {
      const result = await TimeService.getTimeEntries(req.query, req.user);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getTimeEntry(req, res, next) {
    try {
      const { id } = req.params;
      const entry = await TimeService.getTimeEntryById(id, req.user);
      res.status(200).json({ entry });
    } catch (err) {
      next(err);
    }
  }

  static async createTimeEntry(req, res, next) {
    try {
      const validated = createTimeEntrySchema.parse(req.body);
      const entry = await TimeService.createTimeEntry(req.user.id, validated, req.user, req);
      res.status(201).json({
        message: 'Work time logged successfully',
        entry
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateTimeEntry(req, res, next) {
    try {
      const { id } = req.params;
      const validated = updateTimeEntrySchema.parse(req.body);
      const entry = await TimeService.updateTimeEntry(id, validated, req.user, req);
      res.status(200).json({
        message: 'Time entry updated successfully',
        entry
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteTimeEntry(req, res, next) {
    try {
      const { id } = req.params;
      const result = await TimeService.deleteTimeEntry(id, req.user, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // TIMESHEETS
  // ==========================================

  static async getTimesheets(req, res, next) {
    try {
      const result = await TimeService.getTimesheets(req.query, req.user);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getTimesheet(req, res, next) {
    try {
      const { id } = req.params;
      const timesheet = await TimeService.getTimesheetById(id, req.user);
      res.status(200).json({ timesheet });
    } catch (err) {
      next(err);
    }
  }

  static async createTimesheet(req, res, next) {
    try {
      const validated = createTimesheetSchema.parse(req.body);
      const timesheet = await TimeService.createTimesheet(req.user.id, validated, req.user, req);
      res.status(201).json({
        message: 'Timesheet prepared successfully with linked work logs',
        timesheet
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitTimesheet(req, res, next) {
    try {
      const { id } = req.params;
      const timesheet = await TimeService.submitTimesheet(id, req.user, req);
      res.status(200).json({
        message: 'Timesheet submitted for approval successfully',
        timesheet
      });
    } catch (err) {
      next(err);
    }
  }

  static async approveTimesheet(req, res, next) {
    try {
      const { id } = req.params;
      const timesheet = await TimeService.approveTimesheet(id, req.user, req);
      res.status(200).json({
        message: 'Timesheet approved successfully',
        timesheet
      });
    } catch (err) {
      next(err);
    }
  }

  static async rejectTimesheet(req, res, next) {
    try {
      const { id } = req.params;
      const validated = rejectTimesheetSchema.parse(req.body);
      const timesheet = await TimeService.rejectTimesheet(id, validated.reviewerComment, req.user, req);
      res.status(200).json({
        message: 'Timesheet revisions requested with feedback',
        timesheet
      });
    } catch (err) {
      next(err);
    }
  }

  static async getUserTimesheets(req, res, next) {
    try {
      const { id } = req.params;
      const result = await TimeService.getTimesheets({ ...req.query, userId: id }, req.user);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // SUMMARIES
  // ==========================================

  static async getSummary(req, res, next) {
    try {
      const summary = await TimeService.getSummary(req.query, req.user);
      res.status(200).json({ summary });
    } catch (err) {
      next(err);
    }
  }

  static async getProjectTimeSummary(req, res, next) {
    try {
      const { id } = req.params;
      const summary = await TimeService.getProjectTimeSummary(id, req.user);
      res.status(200).json({ summary });
    } catch (err) {
      next(err);
    }
  }

  static async getTaskTimeSummary(req, res, next) {
    try {
      const { id } = req.params;
      const summary = await TimeService.getTaskTimeSummary(id, req.user);
      res.status(200).json({ summary });
    } catch (err) {
      next(err);
    }
  }
}
