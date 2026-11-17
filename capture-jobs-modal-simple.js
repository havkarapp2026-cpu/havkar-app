const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 300000
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1280 });
    
    console.log('Opening jobs page...');
    await page.goto('http://127.0.0.1:8765/jobs.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Click FAB to open post job form
    console.log('Clicking FAB...');
    try {
      await page.click('.fab');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log('FAB not found or not clickable');
    }
    
    // Click "Pick workplace on map" button
    console.log('Clicking location picker...');
    try {
      await page.click('#openJobLocationPicker');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (e) {
      console.log('Location picker button not found or not clickable');
    }
    
    // Take screenshot
    await page.screenshot({ path: '/opt/cursor/artifacts/jobs-publish-no-map-overlap.png', fullPage: true });
    console.log('✓ Saved jobs-publish-no-map-overlap.png');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
