import readline from 'readline';
import { launchBrowser, isLoggedIn } from './src/checkinService.js';

async function main() {
  console.log('=====================================================');
  console.log('      Creality Cloud Manual Login Session Tool       ');
  console.log('=====================================================');
  console.log('This will launch the custom Firefox browser in GUI mode.');
  console.log('Please log in manually on the page that opens.');
  console.log('Once logged in, return here and press [Enter] to exit.');
  console.log('');
  console.log('To access the browser interface:');
  console.log('  - Local runs: http://localhost:8080');
  console.log('  - Remote runs: http://<your-server-ip>:8080');
  console.log('=====================================================');

  let browserInfo;
  try {
    // Launch in GUI mode (headless: false)
    browserInfo = await launchBrowser(false);
    const { page, context } = browserInfo;

    console.log('Navigating to Creality Cloud Check-in page...');
    await page.goto('https://www.crealitycloud.com/check-in', { waitUntil: 'domcontentloaded' });

    // Set up readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      rl.question('\n>>> Log in in the browser window, then press ENTER here to save session: ', async () => {
        rl.close();
        
        // Double check login status before closing
        const logged = await isLoggedIn(page);
        if (logged) {
          console.log('\n[SUCCESS] Login detected! Session successfully saved.');
        } else {
          console.log('\n[WARNING] Could not verify login status, but closing browser as requested.');
        }
        resolve();
      });
    });

  } catch (error) {
    console.error('Error during manual login:', error);
  } finally {
    if (browserInfo && browserInfo.context) {
      console.log('Closing browser...');
      await browserInfo.context.close();
    }
    process.exit(0);
  }
}

main();
