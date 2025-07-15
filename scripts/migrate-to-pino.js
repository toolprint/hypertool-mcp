#!/usr/bin/env node

/**
 * Migration script to replace console.* calls with Pino logger
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, extname } from 'path';

const EXCLUDED_DIRS = ['node_modules', 'dist', '.git', '.taskmaster'];
const INCLUDED_EXTENSIONS = ['.ts', '.js'];

// Track statistics
let filesProcessed = 0;
let filesModified = 0;
let replacements = {
  'console.log': 0,
  'console.warn': 0,
  'console.error': 0,
  'console.info': 0,
  'console.debug': 0,
};

/**
 * Process a single file
 */
async function processFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  let modified = false;
  let newContent = content;
  
  // Skip files that already import logger
  if (content.includes('from "./logging') || content.includes('from "../logging')) {
    console.log(`⏭️  Skipping ${filePath} (already uses logger)`);
    return;
  }
  
  // Check if file uses console methods
  const usesConsole = 
    content.includes('console.log') ||
    content.includes('console.warn') ||
    content.includes('console.error') ||
    content.includes('console.info') ||
    content.includes('console.debug');
    
  if (!usesConsole) {
    return;
  }
  
  // Add logger import at the top of the file (after existing imports)
  const importMatch = content.match(/^((?:import .+;\n)+)/m);
  if (importMatch) {
    const lastImportIndex = importMatch.index + importMatch[0].length;
    const relativeImport = getRelativeImportPath(filePath);
    newContent = 
      content.slice(0, lastImportIndex) +
      `import { createLogger } from "${relativeImport}";\n\nconst logger = createLogger({ module: '${getModuleName(filePath)}' });\n` +
      content.slice(lastImportIndex);
  } else {
    // No imports found, add at the beginning
    const relativeImport = getRelativeImportPath(filePath);
    newContent = 
      `import { createLogger } from "${relativeImport}";\n\nconst logger = createLogger({ module: '${getModuleName(filePath)}' });\n\n` +
      content;
  }
  
  // Replace console calls
  const replacementMap = {
    'console.log': 'logger.info',
    'console.warn': 'logger.warn',
    'console.error': 'logger.error',
    'console.info': 'logger.info',
    'console.debug': 'logger.debug',
  };
  
  for (const [consoleMethod, loggerMethod] of Object.entries(replacementMap)) {
    const regex = new RegExp(`\\b${consoleMethod.replace('.', '\\.')}\\b`, 'g');
    const matches = newContent.match(regex);
    if (matches) {
      replacements[consoleMethod] += matches.length;
      newContent = newContent.replace(regex, loggerMethod);
      modified = true;
    }
  }
  
  if (modified) {
    await writeFile(filePath, newContent, 'utf-8');
    filesModified++;
    console.log(`✅ Modified ${filePath}`);
  }
  
  filesProcessed++;
}

/**
 * Get relative import path to logging module
 */
function getRelativeImportPath(filePath) {
  const depth = filePath.split('/src/')[1].split('/').length - 1;
  if (depth === 0) {
    return './logging/index.js';
  }
  return '../'.repeat(depth) + 'logging/index.js';
}

/**
 * Extract module name from file path
 */
function getModuleName(filePath) {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1].replace(/\.[^.]+$/, '');
  const dirName = parts[parts.length - 2];
  
  // Special cases
  if (fileName === 'index') {
    return dirName;
  }
  
  return `${dirName}/${fileName}`;
}

/**
 * Process directory recursively
 */
async function processDirectory(dir) {
  const entries = await readdir(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await stat(fullPath);
    
    if (stats.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(entry)) {
        await processDirectory(fullPath);
      }
    } else if (stats.isFile()) {
      const ext = extname(entry);
      if (INCLUDED_EXTENSIONS.includes(ext)) {
        await processFile(fullPath);
      }
    }
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🔄 Starting migration to Pino logger...\n');
  
  const srcDir = join(process.cwd(), 'src');
  
  try {
    await processDirectory(srcDir);
    
    console.log('\n📊 Migration Summary:');
    console.log(`   Files processed: ${filesProcessed}`);
    console.log(`   Files modified: ${filesModified}`);
    console.log('\n   Replacements:');
    for (const [method, count] of Object.entries(replacements)) {
      if (count > 0) {
        console.log(`   - ${method}: ${count}`);
      }
    }
    
    if (filesModified > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('   Please review the changes and run tests to ensure everything works correctly.');
    } else {
      console.log('\n✅ No files needed modification.');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main().catch(console.error);