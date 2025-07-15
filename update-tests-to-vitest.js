#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

// Get test file from command line argument
const testFile = process.argv[2];
if (!testFile) {
  console.error('Usage: node update-tests-to-vitest.js <test-file>');
  console.error('Example: node update-tests-to-vitest.js ./src/config/parser.test.ts');
  process.exit(1);
}

const filePath = resolve(testFile);
console.log(`\n📝 Updating test file: ${filePath}\n`);

function updateTestFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const originalContent = content;
  let changeLog = [];

  // Add vitest imports
  if (!content.includes('import { describe, it, expect, beforeEach, afterEach, vi }') && 
      !content.includes('from "vitest"') &&
      !content.includes('from \'vitest\'')) {
    // Find what vitest functions are used in the file
    const vitestFunctions = [];
    if (content.includes('describe(')) vitestFunctions.push('describe');
    if (content.includes('it(') || content.includes('test(')) vitestFunctions.push('it');
    if (content.includes('expect(')) vitestFunctions.push('expect');
    if (content.includes('beforeEach(')) vitestFunctions.push('beforeEach');
    if (content.includes('afterEach(')) vitestFunctions.push('afterEach');
    if (content.includes('beforeAll(')) vitestFunctions.push('beforeAll');
    if (content.includes('afterAll(')) vitestFunctions.push('afterAll');
    if (content.includes('jest.')) vitestFunctions.push('vi');

    if (vitestFunctions.length > 0) {
      const importStatement = `import { ${vitestFunctions.join(', ')} } from 'vitest';\n`;
      // Add after the first import or at the beginning
      const firstImportMatch = content.match(/^import\s+.+$/m);
      if (firstImportMatch) {
        const insertPos = content.indexOf(firstImportMatch[0]) + firstImportMatch[0].length;
        content = content.slice(0, insertPos) + '\n' + importStatement + content.slice(insertPos);
      } else {
        content = importStatement + content;
      }
      changeLog.push('✓ Added vitest imports');
    }
  }

  // Replace jest.mock with vi.mock
  if (content.includes('jest.mock(')) {
    content = content.replace(/jest\.mock\(/g, 'vi.mock(');
    changeLog.push('✓ Replaced jest.mock with vi.mock');
  }

  // Replace jest.fn with vi.fn
  if (content.includes('jest.fn(')) {
    content = content.replace(/jest\.fn\(/g, 'vi.fn(');
    changeLog.push('✓ Replaced jest.fn with vi.fn');
  }

  // Replace jest.spyOn with vi.spyOn
  if (content.includes('jest.spyOn(')) {
    content = content.replace(/jest\.spyOn\(/g, 'vi.spyOn(');
    changeLog.push('✓ Replaced jest.spyOn with vi.spyOn');
  }

  // Replace jest.clearAllMocks with vi.clearAllMocks
  if (content.includes('jest.clearAllMocks(')) {
    content = content.replace(/jest\.clearAllMocks\(/g, 'vi.clearAllMocks(');
    changeLog.push('✓ Replaced jest.clearAllMocks with vi.clearAllMocks');
  }

  // Replace jest.resetAllMocks with vi.resetAllMocks
  if (content.includes('jest.resetAllMocks(')) {
    content = content.replace(/jest\.resetAllMocks\(/g, 'vi.resetAllMocks(');
    changeLog.push('✓ Replaced jest.resetAllMocks with vi.resetAllMocks');
  }

  // Replace jest.Mocked with vi.Mocked (though vitest uses MockedObject)
  if (content.includes('jest.Mocked<')) {
    content = content.replace(/jest\.Mocked</g, 'vi.Mocked<');
    changeLog.push('✓ Replaced jest.Mocked with vi.Mocked');
  }

  // Replace as jest.Mocked with as vi.Mocked
  if (content.includes('as jest.Mocked')) {
    content = content.replace(/as jest\.Mocked/g, 'as vi.Mocked');
    changeLog.push('✓ Replaced type assertions');
  }

  // Replace other jest references
  content = content.replace(/jest\./g, 'vi.');

  // Update file if changes were made
  if (content !== originalContent) {
    writeFileSync(filePath, content, 'utf8');
    console.log('Changes made:');
    changeLog.forEach(change => console.log(`  ${change}`));
    console.log('\n✅ Test file updated successfully!');
    return true;
  } else {
    console.log('ℹ️  No changes needed - file already uses Vitest or has no test syntax');
    return false;
  }
}

// Update the file
const updated = updateTestFile(filePath);

if (updated) {
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm test -- ' + testFile);
  console.log('2. Fix any remaining issues manually');
  console.log('3. Proceed to the next test file');
}