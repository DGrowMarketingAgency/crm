import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { testConnection } from './config/db.js';
import { seedRbac } from './modules/rbac/rbac.seed.js';
import { socketService } from './modules/notifications/socket.service.js';
import { emailService } from './modules/notifications/email.service.js';
import { RemindersService } from './modules/notifications/reminders.service.js';
import { runMigration021 } from './scripts/run-migration-021.js';
import { runMigration022 } from './scripts/run-migration-022.js';
import { runMigration023 } from './scripts/run-migration-023.js';
import { runMigration024 } from './scripts/run-migration-024.js';
import { runMigration025 } from './scripts/run-migration-025.js';
import { runMigration026 } from './scripts/run-migration-026.js';
import { runMigration027 } from './scripts/run-migration-027.js';
import { runMigration028 } from './scripts/run-migration-028.js';
import { runMigration029 } from './scripts/run-migration-029.js';
import { runMigration030 } from './scripts/run-migration-030.js';
import { ProjectFlowService } from './modules/project-flow/projectFlow.service.js';
import { BillingAlertsService } from './modules/finance/billingAlerts.service.js';
import { SalesRemindersService } from './modules/sales/salesReminders.service.js';
import { ExpenseRemindersService } from './modules/expenses/expenseReminders.service.js';

async function startServer() {
  console.log('🔄 Checking database connectivity...');
  const dbReady = await testConnection();

  if (!dbReady) {
    console.error('❌ Failed to establish database connection during server startup.');
    console.error('   Please check your DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in .env.');
    process.exit(1);
  }

  console.log(`✅ Database connected successfully (${env.DB_NAME} on ${env.DB_HOST}:${env.DB_PORT})`);

  // Idempotently seed system roles and permission registry
  await seedRbac();
  console.log('🛡️  RBAC system roles and permissions synchronized.');

  // Idempotent schema for project pipelines / client project flow
  try {
    await runMigration021();
    await runMigration022();
    await runMigration023();
    await runMigration024();
    await runMigration025();
    await runMigration026();
    await runMigration027();
    await runMigration028();
    await runMigration029();
    await runMigration030();
  } catch (err) {
    console.error('⚠️ Startup migration (021-030) failed:', err.message);
  }

  // Create HTTP server and initialize Socket.IO
  const server = http.createServer(app);
  socketService.init(server);
  console.log('⚡ Socket.IO real-time notification engine initialized.');

  // Asynchronous background email queue processor (every 5 seconds)
  const emailInterval = setInterval(() => {
    emailService.processQueue(10).catch((err) => console.error('Email worker error:', err));
  }, 5000);

  // Automated deadline reminder processor (every 60 seconds)
  const remindersInterval = setInterval(() => {
    RemindersService.checkAndSendReminders().catch((err) => console.error('Reminders worker error:', err));
  }, 60000);

  // Regular (retainer) projects: create this month's cycle on boot and re-check every 6 hours
  // Billing reminders (overdue / due / retainer renewals) run right after, so new cycles' invoices are counted.
  const runCycles = () =>
    ProjectFlowService.runMonthlyCycles()
      .then((r) => r.created && console.log(`🔁 Created ${r.created} monthly project cycle(s) for ${r.month}`))
      .catch((err) => console.error('Monthly cycle worker error:', err))
      .then(() => BillingAlertsService.runReminders())
      .then((r) => r?.sent && console.log(`🔔 Sent ${r.sent} billing reminder(s)`))
      .catch((err) => console.error('Billing reminder worker error:', err));
  runCycles();
  const cyclesInterval = setInterval(runCycles, 6 * 60 * 60 * 1000);

  // Sales reminders: meetings starting within the hour, and each person's morning follow-up summary
  // EMI (due soon / today / overdue / final) and low ad-wallet alerts share the same 5-minute tick.
  const runSalesReminders = () =>
    SalesRemindersService.run()
      .then((r) => r.sent && console.log(`⏰ Sent ${r.sent} sales reminder(s)`))
      .catch((err) => console.error('Sales reminder worker error:', err))
      .then(() => ExpenseRemindersService.run())
      .then((r) => r?.sent && console.log(`💳 Sent ${r.sent} EMI / ad-fund alert(s)`))
      .catch((err) => console.error('EMI reminder worker error:', err));
  runSalesReminders();
  const salesRemindersInterval = setInterval(runSalesReminders, 5 * 60 * 1000);

  server.listen(env.PORT, () => {
    console.log(`🚀 Agency Manager Server running on http://localhost:${env.PORT}`);
    console.log(`🛡️  Allowed Client Origin: ${env.CLIENT_URL}`);
    console.log(`🌱 Environment: ${env.NODE_ENV}`);
  });

  // Graceful shutdown handlers
  const shutdown = () => {
    console.log('\n🛑 Gracefully shutting down server...');
    clearInterval(emailInterval);
    clearInterval(remindersInterval);
    clearInterval(cyclesInterval);
    clearInterval(salesRemindersInterval);
    server.close(() => {
      console.log('🏁 HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();

