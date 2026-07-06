import { launchBrowser, executeCheckin, executeRaffle } from './src/checkinService.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('=====================================================');
  console.log('      Creality Cloud Daily Check-in Automation       ');
  console.log('=====================================================');
  
  const headless = process.env.HEADLESS !== 'false';
  
  let browserInfo;
  try {
    browserInfo = await launchBrowser(headless);
    const { page } = browserInfo;

    const checkinResult = await executeCheckin(page);
    
    console.log('\nResult of Check-in:');
    if (checkinResult.success) {
      console.log(`✅ SUCCESS: ${checkinResult.message}`);
      
      // Run the check-in raffle draw automation
      const raffleResult = await executeRaffle(page);
      console.log('\nResult of Raffle Draws:');
      if (raffleResult.success) {
        console.log(`✅ SUCCESS: ${raffleResult.message}`);
        if (raffleResult.prizes.length > 0) {
          console.log('Prizes won:');
          raffleResult.prizes.forEach((prize, idx) => console.log(`  - Draw #${idx + 1}: ${prize}`));
        }
      } else {
        console.log(`❌ FAILED: ${raffleResult.message}`);
      }
    } else {
      console.log(`❌ FAILED: ${checkinResult.message}`);
    }

  } catch (error) {
    console.error('\n💥 Unexpected error during check-in script execution:', error);
  } finally {
    if (browserInfo && browserInfo.context) {
      console.log('\nClosing browser...');
      await browserInfo.context.close();
    }
    process.exit(0);
  }
}

main();
