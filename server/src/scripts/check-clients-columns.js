import { pool } from '../config/db.js';

async function check() {
  const [cols] = await pool.query("SHOW FULL COLUMNS FROM clients");
  for (const c of cols) {
    if (['status', 'lifecycle_stage', 'entity', 'vertical'].includes(c.Field)) {
      console.log(c.Field, c.Type, c.Default);
    }
  }
  process.exit(0);
}
check();
