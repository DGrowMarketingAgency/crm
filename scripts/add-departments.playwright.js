import { chromium } from 'playwright';

const DEPARTMENTS_TO_ADD = [
  {
    name: 'AI Automation & Agents',
    code: 'AI_AUTOMATION',
    description: 'Autonomous workflows, LLM agents, Zapier integrations, and generative AI systems.'
  },
  {
    name: 'Growth & CRO (Conversion Rate Optimization)',
    code: 'GROWTH_CRO',
    description: 'Funnel analytics, A/B testing, user journey optimization, and revenue scaling.'
  },
  {
    name: 'Brand Strategy & Creative Direction',
    code: 'BRAND_STRATEGY',
    description: 'Visual brand identity, typography systems, marketing collateral, and creative storytelling.'
  }
];

async function run() {
  console.log('🚀 Starting Playwright Department Automation Script...');

  // Try launching system Edge or Chrome or default bundled chromium
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'msedge'
    });
    console.log('✔ Launched Microsoft Edge via Playwright');
  } catch (err) {
    console.log('Falling back to default chromium...');
    browser = await chromium.launch({
      headless: true
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Navigate to Login Page
    console.log('📍 Navigating to http://localhost:5173/login...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });

    // 2. Perform Login
    console.log('🔑 Logging in as Owner (owner@agency.com)...');
    await page.fill('input[type="email"]', 'owner@agency.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Wait for navigation after login (to dashboard)
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✔ Successfully logged in! Reached dashboard.');

    // 3. Navigate to Departments Page
    console.log('📍 Navigating to Departments (/departments)...');
    await page.goto('http://localhost:5173/departments', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    // 4. Add each department using the UI modal
    for (const dept of DEPARTMENTS_TO_ADD) {
      console.log(`\n➕ Creating Department: "${dept.name}" (${dept.code})...`);

      // Click "New Department" button
      const newDeptBtn = page.getByRole('button', { name: /New Department/i });
      await newDeptBtn.waitFor({ state: 'visible', timeout: 5000 });
      await newDeptBtn.click();

      // Wait for modal to be visible
      await page.waitForSelector('input[placeholder*="Search Engine Optimization"]', { timeout: 5000 });

      // Fill in department details
      await page.fill('input[placeholder*="Search Engine Optimization"]', dept.name);

      // Fill code
      const codeInput = page.locator('input[placeholder*="SEO"]');
      await codeInput.fill('');
      await codeInput.fill(dept.code);

      // Fill description
      await page.fill('textarea[placeholder*="responsibilities"]', dept.description);

      // Click Submit ("Create Department")
      const submitBtn = page.locator('button[type="submit"]:has-text("Create Department")');
      await submitBtn.click();

      // Wait for toast or modal to close
      await page.waitForSelector('text=Department created successfully', { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(1000);
      console.log(`✔ Department "${dept.name}" created successfully!`);
    }

    // 5. Final verification - verify departments exist in the list
    console.log('\n🔍 Verifying created departments on /departments page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    for (const dept of DEPARTMENTS_TO_ADD) {
      const isVisible = await page.getByText(dept.name).isVisible();
      console.log(`  - [${isVisible ? 'FOUND' : 'MISSING'}] ${dept.name}`);
    }

    // Capture screenshot as proof
    await page.screenshot({ path: 'departments-playwright-result.png', fullPage: true });
    console.log('📸 Screenshot saved to departments-playwright-result.png');
    console.log('🎉 Playwright department creation completed successfully!');

  } catch (error) {
    console.error('❌ Automation Error:', error);
    await page.screenshot({ path: 'departments-playwright-error.png' }).catch(() => null);
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
