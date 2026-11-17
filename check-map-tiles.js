const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1280 });
    
    // Check buy-sell map
    console.log('Checking Buy-Sell map tiles...');
    await page.goto('http://127.0.0.1:8765/buy-sell.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const buySellMapStatus = await page.evaluate(() => {
      const mapContainer = document.querySelector('.leaflet-container, #map, [class*="map"]');
      if (!mapContainer) return 'No map container found';
      
      const tiles = document.querySelectorAll('.leaflet-tile');
      if (tiles.length === 0) return 'No tiles loaded';
      
      // Check if tiles have "API KEY REQUIRED" or are placeholder
      const firstTileSrc = tiles[0]?.src || '';
      if (firstTileSrc.includes('api_key_required') || firstTileSrc.includes('placeholder')) {
        return 'PLACEHOLDER TILES (API KEY REQUIRED watermark)';
      }
      
      return `${tiles.length} tiles loaded, first src: ${firstTileSrc.substring(0, 100)}`;
    });
    
    console.log('Buy-Sell map:', buySellMapStatus);
    
    // Check tickets map
    console.log('\nChecking Tickets map tiles...');
    await page.goto('http://127.0.0.1:8765/tickets.html', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const ticketsMapStatus = await page.evaluate(() => {
      const mapContainer = document.querySelector('.leaflet-container, #map, #travelMapPanel');
      if (!mapContainer) return 'No map container found';
      
      const tiles = document.querySelectorAll('.leaflet-tile');
      if (tiles.length === 0) return 'No tiles loaded';
      
      const firstTileSrc = tiles[0]?.src || '';
      if (firstTileSrc.includes('api_key_required') || firstTileSrc.includes('placeholder')) {
        return 'PLACEHOLDER TILES (API KEY REQUIRED watermark)';
      }
      
      return `${tiles.length} tiles loaded, first src: ${firstTileSrc.substring(0, 100)}`;
    });
    
    console.log('Tickets map:', ticketsMapStatus);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
