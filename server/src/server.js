import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { testConnection } from './config/db.js';
import { seedRbac } from './modules/rbac/rbac.seed.js';
import { socketService } from './modules/notifications/socket.service.js';
import { emailService } from './modules/notifications/email.service.js';
import { RemindersService } from './modules/notifications/reminders.service.js';

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
    server.close(() => {
      console.log('🏁 HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();

