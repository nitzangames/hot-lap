const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Set viewport to match game aspect ratio
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', err => errors.push(err.toString()));

  await page.goto('http://localhost:8082', { waitUntil: 'networkidle0', timeout: 10000 });
  await new Promise(r => setTimeout(r, 1000));

  // Screenshot 1: Title screen
  await page.screenshot({ path: '/Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D/screenshot-title.png' });
  console.log('Saved: screenshot-title.png');

  // Tap to go to car select
  await page.click('canvas');
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 2: Car selection screen
  await page.screenshot({ path: '/Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D/screenshot-carselect.png' });
  console.log('Saved: screenshot-carselect.png');

  // Click the RACE button (bottom center area)
  await page.click('canvas', { offset: { x: 270, y: 680 } });
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 3: Countdown
  await page.screenshot({ path: '/Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D/screenshot-countdown.png' });
  console.log('Saved: screenshot-countdown.png');

  // Wait for race to start
  await new Promise(r => setTimeout(r, 4000));

  // Screenshot 4: Racing
  await page.screenshot({ path: '/Users/nitzanwilnai/Programming/Claude/JSGames/RacingGame2D/screenshot-racing.png' });
  console.log('Saved: screenshot-racing.png');

  if (errors.length > 0) {
    console.log('JS Errors:', errors);
  }

  await browser.close();
})();
