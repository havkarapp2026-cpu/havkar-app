const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // 1. Tablet portrait 768x1024
    console.log('Capturing tablet portrait 768x1024...');
    await page.setViewport({ width: 768, height: 1024 });
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      localStorage.setItem('havkar_language', 'fa');
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.screenshot({ path: '/opt/cursor/artifacts/fix206-home-tablet-portrait.png', fullPage: true });
    console.log('✓ Saved fix206-home-tablet-portrait.png');
    
    // 2. Tablet landscape 1024x768
    console.log('Capturing tablet landscape 1024x768...');
    await page.setViewport({ width: 1024, height: 768 });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.screenshot({ path: '/opt/cursor/artifacts/fix206-home-tablet-landscape.png', fullPage: true });
    console.log('✓ Saved fix206-home-tablet-landscape.png');
    
    // 3. About page - check legal info
    console.log('Capturing about page...');
    await page.goto('http://127.0.0.1:8765/about.html', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: '/opt/cursor/artifacts/fix206-about-legal-present.png', fullPage: true });
    console.log('✓ Saved fix206-about-legal-present.png');
    
    // 4. Phone width 390px
    console.log('Capturing phone width 390px...');
    await page.setViewport({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: '/opt/cursor/artifacts/fix206-home-phone.png', fullPage: true });
    console.log('✓ Saved fix206-home-phone.png');
    
    console.log('\nAll screenshots captured successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
