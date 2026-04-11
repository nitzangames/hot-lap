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
  await page.screenshot({ path: './screenshot-title.png' });
  console.log('Saved: screenshot-title.png');

  // Title RACE button → car select
  await page.mouse.click(270, 548);
  await new Promise(r => setTimeout(r, 400));

  // Screenshot 2: Car selection screen
  await page.screenshot({ path: './screenshot-carselect.png' });
  console.log('Saved: screenshot-carselect.png');

  // Car select RACE! button → track select
  await page.mouse.click(270, 525);
  await new Promise(r => setTimeout(r, 400));

  // Screenshot 3: Track select
  await page.screenshot({ path: './screenshot-trackselect.png' });
  console.log('Saved: screenshot-trackselect.png');

  // Tap Track 01 tile → countdown
  await page.mouse.click(83, 168);
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 4: Countdown
  await page.screenshot({ path: './screenshot-countdown.png' });
  console.log('Saved: screenshot-countdown.png');

  // Wait for race to start
  await new Promise(r => setTimeout(r, 4500));

  // Screenshot 5: Racing
  await page.screenshot({ path: './screenshot-racing.png' });
  console.log('Saved: screenshot-racing.png');

  if (errors.length > 0) {
    console.log('JS Errors:', errors);
  }

  await browser.close();
})();
