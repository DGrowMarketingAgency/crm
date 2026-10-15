import { seedRbac } from '../modules/rbac/rbac.seed.js';

seedRbac()
  .then(() => {
    console.log('RBAC seeded successfully with Phase 2 client permissions!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to seed RBAC:', err);
    process.exit(1);
  });
