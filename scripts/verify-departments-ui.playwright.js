import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'owner@agency.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  // 2. Go to departments
  await page.goto('http://localhost:5173/departments', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 3. Take full page screenshot
  await page.screenshot({ path: 'departments-overview-playwright.png', fullPage: false });
  console.log('Saved overview screenshot to departments-overview-playwright.png');

  await browser.close();
}

run().catch(console.error);
