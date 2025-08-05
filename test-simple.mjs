// Test if the issue is in the integration test itself
import { resetGlobalLogger, getLogger } from './dist/utils/logging.js';

console.log('Creating logger...');
const logger = getLogger();
logger.info('Test message');

console.log('Creating child loggers...');
for (let i = 0; i < 20; i++) {
  const child = logger.child({ module: `test${i}` });
  child.info(`Child message ${i}`);
}

console.log('Done - no warnings should appear');
