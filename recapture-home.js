const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Set language to English first
    await page.setViewport({ width: 800, height: 1280 });
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      localStorage.setItem('havkar_language', 'en');
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await page.screenshot({ path: '/opt/cursor/artifacts/home-15-tiles.png', fullPage: true });
    console.log('✓ Recaptured home-15-tiles.png');
    
    // Phone
    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({ path: '/opt/cursor/artifacts/home-phone.png', fullPage: true });
    await page.screenshot({ path: '/opt/cursor/artifacts/home-ios.png', fullPage: true });
    console.log('✓ Recaptured home-phone.png and home-ios.png');
    
    // Desktop
    await page.setViewport({ width: 1280, height: 800 });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({ path: '/opt/cursor/artifacts/home-desktop.png', fullPage: true });
    console.log('✓ Recaptured home-desktop.png');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
