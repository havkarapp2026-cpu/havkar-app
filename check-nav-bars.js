const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1280 });
    
    // Check buy-sell bottom nav
    await page.goto('http://127.0.0.1:8765/buy-sell.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const buySellNav = await page.evaluate(() => {
      const nav = document.querySelector('nav, .bottom-nav, [class*="nav"]');
      if (nav) {
        const text = nav.innerText || nav.textContent;
        return text;
      }
      return 'No nav found';
    });
    
    console.log('Buy-Sell bottom nav text:', buySellNav);
    console.log('Has Profile tab:', buySellNav.includes('Profile') ? 'YES (FAIL)' : 'NO (PASS)');
    
    // Check services bottom nav
    await page.goto('http://127.0.0.1:8765/services.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const servicesNav = await page.evaluate(() => {
      const nav = document.querySelector('nav, .bottom-nav, [class*="nav"]');
      if (nav) {
        const text = nav.innerText || nav.textContent;
        return text;
      }
      return 'No nav found';
    });
    
    console.log('\nServices bottom nav text:', servicesNav);
    console.log('Has Profile tab:', servicesNav.includes('Profile') ? 'YES (FAIL)' : 'NO (PASS)');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
