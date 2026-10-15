import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { pool } from '../../config/db.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.isMock = false;
    this.initTransporter();
  }

  initTransporter() {
    if (env.SMTP_HOST && env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE || false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD || ''
        }
      });
      this.isMock = false;
    } else {
      // In-memory / Mock transport for development and automated testing
      this.isMock = true;
      this.transporter = {
        sendMail: async (mailOptions) => {
          // Record or simulate delivery
          return {
            messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            accepted: [mailOptions.to],
            rejected: []
          };
        }
      };
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generates modern responsive agency email HTML template
   */
  generateHtmlTemplate({ title, heading, bodyHtml, actionUrl, actionText }) {
    const safeTitle = this.escapeHtml(title);
    const safeHeading = this.escapeHtml(heading);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background-color: #047857; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .content { padding: 32px; line-height: 1.6; font-size: 14px; }
    .content h2 { margin-top: 0; font-size: 18px; color: #0f172a; font-weight: 600; }
    .btn-container { margin: 28px 0 20px 0; }
    .btn { display: inline-block; background-color: #047857; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; }
    .footer { padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Agency Manager Workflow</h1>
    </div>
    <div class="content">
      <h2>${safeHeading}</h2>
      <div>${bodyHtml}</div>
      ${
        actionUrl && actionText
          ? `<div class="btn-container"><a href="${actionUrl}" class="btn">${this.escapeHtml(
              actionText
            )}</a></div>`
          : ''
      }
    </div>
    <div class="footer">
      <p>This is an automated notification from Agency Task & Project Management System.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Enqueues an email job into MySQL `email_jobs` queue
   */
  async enqueueEmail({ recipientEmail, subject, htmlBody, textBody, idempotencyKey = null, db = pool }) {
    if (!recipientEmail) return null;

    try {
      const [res] = await db.query(
        `INSERT INTO email_jobs (idempotency_key, recipient_email, subject, html_body, text_body, status, scheduled_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NOW())
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
        [idempotencyKey, recipientEmail, subject, htmlBody, textBody]
      );

      return res.insertId;
    } catch (err) {
      console.error('Failed to enqueue email job:', err);
      return null;
    }
  }

  /**
   * Processes pending email jobs from MySQL queue
   */
  async processQueue(batchSize = 10) {
    const connection = await pool.getConnection();
    try {
      // Find pending jobs scheduled for delivery
      const [jobs] = await connection.query(
        `SELECT id, recipient_email, subject, html_body, text_body, attempts, max_attempts
         FROM email_jobs
         WHERE status = 'pending' AND scheduled_at <= NOW()
         ORDER BY id ASC
         LIMIT ?`,
        [batchSize]
      );

      if (jobs.length === 0) {
        connection.release();
        return 0;
      }

      for (const job of jobs) {
        // Mark as processing
        await connection.query(
          `UPDATE email_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = ?`,
          [job.id]
        );

        try {
          await this.transporter.sendMail({
            from: env.SMTP_FROM,
            to: job.recipient_email,
            subject: job.subject,
            html: job.html_body,
            text: job.text_body
          });

          // Mark as sent
          await connection.query(
            `UPDATE email_jobs SET status = 'sent', processed_at = NOW(), error_message = NULL WHERE id = ?`,
            [job.id]
          );
        } catch (mailError) {
          console.error(`Email delivery error for job ${job.id}:`, mailError.message);
          const nextAttempt = job.attempts + 1;
          const isFailed = nextAttempt >= job.max_attempts;

          // Exponential backoff delay (seconds): 30s, 120s, 480s
          const backoffSeconds = Math.pow(2, nextAttempt) * 15;

          await connection.query(
            `UPDATE email_jobs
             SET status = ?,
                 error_message = ?,
                 scheduled_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
             WHERE id = ?`,
            [isFailed ? 'failed' : 'pending', mailError.message, backoffSeconds, job.id]
          );
        }
      }

      connection.release();
      return jobs.length;
    } catch (err) {
      connection.release();
      console.error('Email queue processing failed:', err);
      return 0;
    }
  }
}

export const emailService = new EmailService();
