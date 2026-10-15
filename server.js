/**
 * D-GROW OS Agency Manager — Cloud & Hostinger Deployment Entry Point
 * 
 * This root entry file delegates to the modular server engine at ./server/src/server.js.
 * It ensures compatibility with cloud platforms (Hostinger, Render, Railway, cPanel)
 * that expect an entry file named 'server.js' in the root directory.
 */

import './server/src/server.js';
