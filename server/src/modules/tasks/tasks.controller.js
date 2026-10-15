import path from 'path';
import fs from 'fs';
import { TasksService } from './tasks.service.js';

export class TasksController {
  static async listTasks(req, res, next) {
    try {
      const {
        projectId = '',
        clientId = '',
        serviceInstanceId = '',
        source = '',
        columnStatus = '',
        status = '',
        priority = '',
        assigneeId = '',
        dueDate = '',
        search = '',
        isArchived = false,
        sortBy = 'created_at',
        sortOrder = 'desc',
        limit = 25,
        offset = 0
      } = req.query;

      const result = await TasksService.listTasks(
        {
          projectId,
          clientId,
          serviceInstanceId,
          source,
          columnStatus,
          status,
          priority,
          assigneeId,
          dueDate,
          search,
          isArchived,
          sortBy,
          sortOrder,
          limit: Number(limit) || 25,
          offset: Number(offset) || 0
        },
        req.user
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getMyTasks(req, res, next) {
    try {
      const { status = '', priority = '', limit = 50, offset = 0 } = req.query;
      const result = await TasksService.listTasks(
        {
          assigneeId: req.user.id,
          status,
          priority,
          limit: Number(limit) || 50,
          offset: Number(offset) || 0
        },
        req.user
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getProjectTasks(req, res, next) {
    try {
      const { status = '', priority = '', limit = 50, offset = 0 } = req.query;
      const result = await TasksService.listTasks(
        {
          projectId: req.params.id,
          status,
          priority,
          limit: Number(limit) || 50,
          offset: Number(offset) || 0
        },
        req.user
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getTask(req, res, next) {
    try {
      const task = await TasksService.getTaskById(req.params.id, req.user);
      res.json({ task });
    } catch (err) {
      next(err);
    }
  }

  static async createTask(req, res, next) {
    try {
      const task = await TasksService.createTask(req.body, req.user, req);
      res.status(201).json({ message: 'Task created successfully', task });
    } catch (err) {
      next(err);
    }
  }

  static async updateTask(req, res, next) {
    try {
      const task = await TasksService.updateTask(req.params.id, req.body, req.user, req);
      res.json({ message: 'Task updated successfully', task });
    } catch (err) {
      next(err);
    }
  }

  static async changeStatus(req, res, next) {
    try {
      const task = await TasksService.changeTaskStatus(
        req.params.id,
        req.body,
        null,
        req.user,
        req
      );
      res.json({ message: 'Task status updated successfully', task });
    } catch (err) {
      next(err);
    }
  }

  static async reopenTask(req, res, next) {
    try {
      const task = await TasksService.reopenTask(req.params.id, req.body.comment, req.user, req);
      res.json({ message: 'Task reopened successfully', task });
    } catch (err) {
      next(err);
    }
  }

  static async archiveTask(req, res, next) {
    try {
      await TasksService.archiveTask(req.params.id, req.user, req);
      res.json({ message: 'Task archived successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async deleteTask(req, res, next) {
    try {
      await TasksService.deleteTask(req.params.id, req.user, req);
      res.json({ message: 'Task deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  // --- Assignees ---
  static async getAssignees(req, res, next) {
    try {
      const task = await TasksService.getTaskById(req.params.id, req.user);
      res.json({ assignees: task.assignees });
    } catch (err) {
      next(err);
    }
  }

  static async updateAssignees(req, res, next) {
    try {
      const task = await TasksService.updateTaskAssignees(
        req.params.id,
        req.body.assigneeIds,
        req.user,
        req
      );
      res.json({ message: 'Assignees updated successfully', task });
    } catch (err) {
      next(err);
    }
  }

  // --- Subtasks ---
  static async getSubtasks(req, res, next) {
    try {
      const subtasks = await TasksService.getTaskSubtasks(req.params.id, req.user);
      res.json({ subtasks });
    } catch (err) {
      next(err);
    }
  }

  static async createSubtask(req, res, next) {
    try {
      const subtask = await TasksService.createSubtask(req.params.id, req.body, req.user, req);
      res.status(201).json({ message: 'Subtask created successfully', subtask });
    } catch (err) {
      next(err);
    }
  }

  // --- Comments ---
  static async getComments(req, res, next) {
    try {
      const comments = await TasksService.getTaskComments(req.params.id, req.user);
      res.json({ comments });
    } catch (err) {
      next(err);
    }
  }

  static async createComment(req, res, next) {
    try {
      const comment = await TasksService.createComment(req.params.id, req.body.commentText, req.user, req);
      res.status(201).json({ message: 'Comment added successfully', comment });
    } catch (err) {
      next(err);
    }
  }

  static async updateComment(req, res, next) {
    try {
      const comment = await TasksService.updateComment(
        req.params.id,
        req.params.commentId,
        req.body.commentText,
        req.user,
        req
      );
      res.json({ message: 'Comment updated successfully', comment });
    } catch (err) {
      next(err);
    }
  }

  static async deleteComment(req, res, next) {
    try {
      await TasksService.deleteComment(req.params.id, req.params.commentId, req.user, req);
      res.json({ message: 'Comment deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  // --- Attachments ---
  static async getAttachments(req, res, next) {
    try {
      const attachments = await TasksService.getTaskAttachments(req.params.id, req.user);
      res.json({ attachments });
    } catch (err) {
      next(err);
    }
  }

  static async uploadAttachment(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file uploaded', code: 'FILE_REQUIRED' }
        });
      }

      const attachment = await TasksService.createAttachment(
        req.params.id,
        {
          originalFilename: req.file.originalname,
          storageKey: req.file.filename,
          mimeType: req.file.mimetype,
          fileSize: req.file.size
        },
        req.user,
        req
      );

      res.status(201).json({ message: 'Attachment uploaded successfully', attachment });
    } catch (err) {
      next(err);
    }
  }

  static async downloadAttachment(req, res, next) {
    try {
      const attachment = await TasksService.getAttachmentForDownload(
        req.params.id,
        req.params.attachmentId,
        req.user
      );

      const uploadDir = path.resolve('uploads', 'attachments');
      const filePath = path.join(uploadDir, attachment.storage_key);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: { message: 'Attachment file not found on disk', code: 'FILE_NOT_FOUND' }
        });
      }

      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.original_filename)}"`
      );

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  static async deleteAttachment(req, res, next) {
    try {
      await TasksService.deleteAttachment(req.params.id, req.params.attachmentId, req.user, req);
      res.json({ message: 'Attachment deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}
