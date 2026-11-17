const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=800,1280']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1280 });
    
    console.log('Opening tickets page...');
    await page.goto('http://127.0.0.1:8765/tickets.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for map tiles
    
    // Check if layer control exists
    const hasLayerControl = await page.evaluate(() => {
      const control = document.querySelector('.leaflet-control-layers');
      return !!control;
    });
    
    console.log('Layer control found:', hasLayerControl);
    
    if (hasLayerControl) {
      // Expand layer control
      console.log('Clicking layer control to expand...');
      await page.evaluate(() => {
        const control = document.querySelector('.leaflet-control-layers');
        if (control) control.click();
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find and click Satellite layer
      console.log('Switching to Satellite layer...');
      const satelliteClicked = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('.leaflet-control-layers-selector'));
        const labels = Array.from(document.querySelectorAll('.leaflet-control-layers-base label'));
        
        // Try to find "Satellite" label
        for (let i = 0; i < labels.length; i++) {
          if (labels[i].textContent.includes('Satellite')) {
            const input = labels[i].querySelector('input') || inputs[i];
            if (input) {
              input.click();
              return true;
            }
          }
        }
        
        // If not found by text, try index 1 (usually satellite)
        if (inputs.length > 1) {
          inputs[1].click();
          return true;
        }
        
        return false;
      });
      
      console.log('Satellite layer clicked:', satelliteClicked);
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for tiles to load
      
      await page.screenshot({ path: '/opt/cursor/artifacts/map-satellite.png', fullPage: false });
      console.log('✓ Saved map-satellite.png');
      
      // Switch to Hybrid
      console.log('Switching to Hybrid layer...');
      const hybridClicked = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('.leaflet-control-layers-selector'));
        const labels = Array.from(document.querySelectorAll('.leaflet-control-layers-base label'));
        
        // Try to find "Hybrid" label
        for (let i = 0; i < labels.length; i++) {
          if (labels[i].textContent.includes('Hybrid')) {
            const input = labels[i].querySelector('input') || inputs[i];
            if (input) {
              input.click();
              return true;
            }
          }
        }
        
        // If not found by text, try index 2 (usually hybrid)
        if (inputs.length > 2) {
          inputs[2].click();
          return true;
        }
        
        return false;
      });
      
      console.log('Hybrid layer clicked:', hybridClicked);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await page.screenshot({ path: '/opt/cursor/artifacts/map-hybrid.png', fullPage: false });
      console.log('✓ Saved map-hybrid.png');
      
    } else {
      console.log('No layer control found - may need to check map buttons instead');
      
      // Try alternative: look for Street/Satellite/Hybrid buttons
      const layerButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.map(b => b.textContent.trim()).filter(t => t.match(/street|satellite|hybrid/i));
      });
      
      console.log('Found layer buttons:', layerButtons);
    }
    
    console.log('\nKeeping browser open for 30 seconds for manual verification...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
