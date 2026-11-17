const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1280 });
    
    console.log('Opening buy-sell page...');
    await page.goto('http://127.0.0.1:8765/buy-sell.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Look for layer buttons
    const buttons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      return allButtons.map(b => ({
        text: b.textContent.trim(),
        id: b.id,
        className: b.className
      })).filter(b => b.text);
    });
    
    console.log('Found buttons:', buttons.slice(0, 20));
    
    // Try clicking "Satellite" button
    const satelliteClicked = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const satelliteBtn = allButtons.find(b => b.textContent.toLowerCase().includes('satellite'));
      if (satelliteBtn) {
        satelliteBtn.click();
        return true;
      }
      return false;
    });
    
    console.log('Satellite button clicked:', satelliteClicked);
    
    if (satelliteClicked) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.screenshot({ path: '/opt/cursor/artifacts/map-satellite.png', fullPage: false });
      console.log('✓ Saved map-satellite.png');
      
      // Try clicking "Hybrid" button
      const hybridClicked = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const hybridBtn = allButtons.find(b => b.textContent.toLowerCase().includes('hybrid'));
        if (hybridBtn) {
          hybridBtn.click();
          return true;
        }
        return false;
      });
      
      console.log('Hybrid button clicked:', hybridClicked);
      
      if (hybridClicked) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await page.screenshot({ path: '/opt/cursor/artifacts/map-hybrid.png', fullPage: false });
        console.log('✓ Saved map-hybrid.png');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
