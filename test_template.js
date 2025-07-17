// Test the current command template generation
import { createCommandTemplates } from './src/scripts/claude-code/utils.js';

async function testTemplate() {
  const templates = await createCommandTemplates();
  console.log('=== List Available Tools Command ===');
  console.log(templates['list-available-tools.md']);
  console.log('\n=== Build Toolset Command ===');
  console.log(templates['build-toolset.md'].substring(0, 500) + '...');
}

testTemplate().catch(console.error);
