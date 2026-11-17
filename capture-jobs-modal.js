const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1280 });
    
    console.log('Opening jobs page...');
    await page.goto('http://127.0.0.1:8765/jobs.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Look for post job / add button
    console.log('Looking for post job button...');
    const buttons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, .fab, [class*="add"], [class*="post"]'));
      return allButtons.map(b => ({
        text: b.textContent.trim().substring(0, 50),
        id: b.id,
        className: b.className
      })).filter(b => b.text || b.className.includes('fab') || b.className.includes('add') || b.className.includes('post'));
    });
    
    console.log('Found potential buttons:', buttons);
    
    // Try clicking FAB or "Post Job" button
    const postClicked = await page.evaluate(() => {
      // Try FAB first
      const fab = document.querySelector('.fab, [class*="floating-action"], button[class*="add-button"]');
      if (fab) {
        fab.click();
        return 'fab';
      }
      
      // Try "Post" or "Create" button
      const allButtons = Array.from(document.querySelectorAll('button'));
      const postBtn = allButtons.find(b => 
        b.textContent.toLowerCase().includes('post') ||
        b.textContent.toLowerCase().includes('create') ||
        b.textContent.toLowerCase().includes('add job')
      );
      if (postBtn) {
        postBtn.click();
        return 'post button';
      }
      
      return false;
    });
    
    console.log('Clicked:', postClicked);
    
    if (postClicked) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Look for location picker button in the form
      console.log('Looking for location picker button...');
      const locationClicked = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const locationBtn = allButtons.find(b => 
          b.textContent.toLowerCase().includes('pick on map') ||
          b.textContent.toLowerCase().includes('location') ||
          b.textContent.toLowerCase().includes('map')
        );
        if (locationBtn) {
          locationBtn.click();
          return true;
        }
        
        // Try calling function directly
        if (typeof openJobLocationPicker === 'function') {
          openJobLocationPicker();
          return 'function';
        }
        
        return false;
      });
      
      console.log('Location picker clicked:', locationClicked);
      
      if (locationClicked) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Check if modal is visible
    const modalVisible = await page.evaluate(() => {
      const modal = document.querySelector('#jobLocationModal, .modal, [class*="modal"]');
      if (modal) {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }
      return false;
    });
    
    console.log('Modal visible:', modalVisible);
    
    // Take screenshot regardless
    await page.screenshot({ path: '/opt/cursor/artifacts/jobs-publish-no-map-overlap.png', fullPage: true });
    console.log('✓ Saved jobs-publish-no-map-overlap.png');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
