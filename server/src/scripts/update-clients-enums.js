import { pool } from '../config/db.js';

async function updateEnums() {
  await pool.query(`
    ALTER TABLE clients 
    MODIFY COLUMN lifecycle_stage ENUM('L0','L1','L2','L3','L4','L5','L6', 'lead', 'qualified', 'proposal', 'won', 'onboarding', 'active', 'paused', 'completed', 'offboarded') NOT NULL DEFAULT 'L1'
  `);
  await pool.query(`
    ALTER TABLE clients 
    MODIFY COLUMN status ENUM('active','inactive','paused','offboarded','onboarding') NOT NULL DEFAULT 'active'
  `);
  console.log('Enums updated successfully');
  process.exit(0);
}

updateEnums().catch((err) => {
  console.error(err);
  process.exit(1);
});
