const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Helper to wait for content
    const waitForContent = async (ms = 3000) => {
      await new Promise(resolve => setTimeout(resolve, ms));
    };
    
    console.log('=== TABLET VIEWPORT SCREENSHOTS ===\n');
    
    // Set tablet viewport (800x1280 portrait)
    await page.setViewport({ width: 800, height: 1280 });
    
    // 1. Home - 15 tiles
    console.log('1. Capturing home-15-tiles.png...');
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/home-15-tiles.png', fullPage: true });
    console.log('✓ Saved home-15-tiles.png\n');
    
    // 2. Central profile
    console.log('2. Capturing central-profile.png...');
    await page.goto('http://127.0.0.1:8765/profile.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/central-profile.png', fullPage: true });
    console.log('✓ Saved central-profile.png\n');
    
    // 3. Buy-sell no profile nav
    console.log('3. Capturing buy-sell-no-profile-nav.png...');
    await page.goto('http://127.0.0.1:8765/buy-sell.html', { waitUntil: 'networkidle0' });
    await waitForContent(3000); // Wait for map tiles
    await page.screenshot({ path: '/opt/cursor/artifacts/buy-sell-no-profile-nav.png', fullPage: true });
    console.log('✓ Saved buy-sell-no-profile-nav.png\n');
    
    // 4. Services no profile nav
    console.log('4. Capturing services-no-profile-nav.png...');
    await page.goto('http://127.0.0.1:8765/services.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/services-no-profile-nav.png', fullPage: true });
    console.log('✓ Saved services-no-profile-nav.png\n');
    
    // 5. Jobs publish no map overlap
    console.log('5. Capturing jobs-publish-no-map-overlap.png...');
    await page.goto('http://127.0.0.1:8765/jobs.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    
    // Try to click "Post Job" or similar button
    try {
      const postButton = await page.$('button:has-text("Post"), button:has-text("Add"), .fab, [class*="post"], [class*="add"]');
      if (postButton) {
        await postButton.click();
        await waitForContent(1000);
      }
    } catch (e) {
      console.log('  (Post button not found, capturing page as-is)');
    }
    
    await page.screenshot({ path: '/opt/cursor/artifacts/jobs-publish-no-map-overlap.png', fullPage: true });
    console.log('✓ Saved jobs-publish-no-map-overlap.png\n');
    
    // 6. Ads add button
    console.log('6. Capturing ads-add-button.png...');
    await page.goto('http://127.0.0.1:8765/ads.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/ads-add-button.png', fullPage: true });
    console.log('✓ Saved ads-add-button.png\n');
    
    // 7. Tickets visible map
    console.log('7. Capturing tickets-visible-map.png...');
    await page.goto('http://127.0.0.1:8765/tickets.html', { waitUntil: 'networkidle0' });
    await waitForContent(5000); // Extra time for map tiles
    
    // Scroll to map if needed
    try {
      await page.evaluate(() => {
        const mapPanel = document.querySelector('#travelMapPanel');
        if (mapPanel) mapPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await waitForContent(2000);
    } catch (e) {}
    
    await page.screenshot({ path: '/opt/cursor/artifacts/tickets-visible-map.png', fullPage: true });
    console.log('✓ Saved tickets-visible-map.png\n');
    
    // 8. Map street layer (using tickets page)
    console.log('8. Capturing map-street.png...');
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/map-street.png', fullPage: false });
    console.log('✓ Saved map-street.png\n');
    
    // 9. Map satellite layer
    console.log('9. Capturing map-satellite.png...');
    try {
      // Try to find and click satellite layer control
      await page.evaluate(() => {
        const layerControl = document.querySelector('.leaflet-control-layers');
        if (layerControl) layerControl.click();
      });
      await waitForContent(500);
      
      // Click satellite option
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label, span'));
        const satelliteLabel = labels.find(el => el.textContent.includes('Satellite'));
        if (satelliteLabel) satelliteLabel.click();
      });
      await waitForContent(3000);
    } catch (e) {
      console.log('  (Satellite layer control not found)');
    }
    
    await page.screenshot({ path: '/opt/cursor/artifacts/map-satellite.png', fullPage: false });
    console.log('✓ Saved map-satellite.png\n');
    
    // 10. Map hybrid layer
    console.log('10. Capturing map-hybrid.png...');
    try {
      await page.evaluate(() => {
        const layerControl = document.querySelector('.leaflet-control-layers');
        if (layerControl) layerControl.click();
      });
      await waitForContent(500);
      
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label, span'));
        const hybridLabel = labels.find(el => el.textContent.includes('Hybrid'));
        if (hybridLabel) hybridLabel.click();
      });
      await waitForContent(3000);
    } catch (e) {
      console.log('  (Hybrid layer control not found)');
    }
    
    await page.screenshot({ path: '/opt/cursor/artifacts/map-hybrid.png', fullPage: false });
    console.log('✓ Saved map-hybrid.png\n');
    
    // 11. Hotels localization
    console.log('11. Capturing hotels-localization.png...');
    await page.goto('http://127.0.0.1:8765/accommodation.html', { waitUntil: 'networkidle0' });
    await waitForContent(3000);
    await page.screenshot({ path: '/opt/cursor/artifacts/hotels-localization.png', fullPage: true });
    console.log('✓ Saved hotels-localization.png\n');
    
    // 12. Messaging original-translated
    console.log('12. Capturing messaging-original-translated.png...');
    await page.goto('http://127.0.0.1:8765/chat.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/messaging-original-translated.png', fullPage: true });
    console.log('✓ Saved messaging-original-translated.png\n');
    
    // 13. Support responsive
    console.log('13. Capturing support-responsive.png...');
    await page.goto('http://127.0.0.1:8765/support.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/support-responsive.png', fullPage: true });
    console.log('✓ Saved support-responsive.png\n');
    
    console.log('=== PHONE VIEWPORT SCREENSHOTS ===\n');
    
    // Phone viewport
    await page.setViewport({ width: 390, height: 844 });
    
    console.log('14. Capturing home-phone.png...');
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/home-phone.png', fullPage: true });
    console.log('✓ Saved home-phone.png\n');
    
    // iOS-ish (reuse 390x844)
    console.log('15. Capturing home-ios.png...');
    await page.screenshot({ path: '/opt/cursor/artifacts/home-ios.png', fullPage: true });
    console.log('✓ Saved home-ios.png\n');
    
    console.log('=== DESKTOP VIEWPORT SCREENSHOTS ===\n');
    
    // Desktop viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log('16. Capturing home-desktop.png...');
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle0' });
    await waitForContent(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/home-desktop.png', fullPage: true });
    console.log('✓ Saved home-desktop.png\n');
    
    console.log('All screenshots captured successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
