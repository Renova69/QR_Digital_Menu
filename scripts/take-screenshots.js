const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'en-US'
  });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:3001/login');
  
  console.log('Logging in...');
  await page.fill('input[type="email"]', 'demo@codespaces.com');
  await page.fill('input[type="password"]', 'codespaces2026');
  await page.click('button[type="submit"]');

  console.log('Waiting for dashboard...');
  // Wait until we reach the dashboard
  await page.waitForURL('**/dashboard**');
  // Wait for the skeleton loaders to disappear or for data to load
  await page.waitForTimeout(3000);

  const docsDir = path.join(__dirname, '..', 'apps', 'docs', 'docs', 'guides');

  console.log('Capturing Analytics Dashboard...');
  await page.screenshot({ path: path.join(docsDir, 'analytics_mockup.png') });

  // Navigate to KDS if it exists, or just POS
  // The route for KDS is likely /staff/kitchen or /pos
  console.log('Navigating to KDS...');
  await page.goto('http://localhost:3001/staff/kitchen');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(docsDir, 'kds_mockup.png') });

  console.log('Navigating to Public Menu...');
  // The public menu URL usually requires the restaurant ID. 
  // Let's get the restaurant ID from the dashboard's "View Public Menu" link or local storage.
  const restaurantId = await page.evaluate(() => {
    // Attempt to extract restaurant ID from a link if it exists
    const link = document.querySelector('a[href^="/menu/"]');
    if (link) {
      return link.getAttribute('href').split('/menu/')[1];
    }
    return null;
  });

  if (restaurantId) {
    await page.goto(`http://localhost:3001/menu/${restaurantId}`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(docsDir, 'public_menu_mockup.png') });
  } else {
    console.log('Could not find restaurant ID for public menu.');
  }

  await browser.close();
}

main().catch(console.error);
