#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

// Get directory from command line argument
const targetDir = process.argv[2];
if (!targetDir) {
  console.error('Usage: node update-imports.js <directory>');
  console.error('Example: node update-imports.js ./src/server');
  process.exit(1);
}

const resolvedDir = resolve(targetDir);
console.log(`Processing directory: ${resolvedDir}`);

function updateImportsInFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  let updated = content;
  let changeCount = 0;
  
  // Update import statements - match various import patterns
  updated = updated.replace(
    /from\s+["'](\.[^"']+)["']/g,
    (match, importPath) => {
      // Skip if already has extension or is importing json
      if (importPath.endsWith('.js') || importPath.endsWith('.json') || importPath.endsWith('.css')) {
        return match;
      }
      // Add .js extension
      changeCount++;
      return `from "${importPath}.js"`;
    }
  );
  
  // Update export statements
  updated = updated.replace(
    /export\s+.*\s+from\s+["'](\.[^"']+)["']/g,
    (match, importPath) => {
      // Skip if already has extension or is importing json
      if (importPath.endsWith('.js') || importPath.endsWith('.json') || importPath.endsWith('.css')) {
        return match;
      }
      // Add .js extension
      changeCount++;
      return match.replace(importPath, `${importPath}.js`);
    }
  );
  
  // Update dynamic imports
  updated = updated.replace(
    /import\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
    (match, importPath) => {
      // Skip if already has extension or is importing json
      if (importPath.endsWith('.js') || importPath.endsWith('.json') || importPath.endsWith('.css')) {
        return match;
      }
      // Add .js extension
      changeCount++;
      return `import("${importPath}.js")`;
    }
  );
  
  if (updated !== content) {
    writeFileSync(filePath, updated, 'utf8');
    console.log(`✓ Updated ${filePath} (${changeCount} import${changeCount !== 1 ? 's' : ''})`);
    return true;
  }
  return false;
}

function processDirectory(dir, depth = 0) {
  const files = readdirSync(dir);
  let totalUpdated = 0;
  let totalFiles = 0;
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip test directories and node_modules
      if (!file.includes('test') && file !== 'node_modules' && file !== 'dist') {
        const result = processDirectory(filePath, depth + 1);
        totalUpdated += result.updated;
        totalFiles += result.total;
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
      totalFiles++;
      if (updateImportsInFile(filePath)) {
        totalUpdated++;
      }
    }
  }
  
  return { updated: totalUpdated, total: totalFiles };
}

console.log('\n🔄 Updating imports to ES modules...\n');
const result = processDirectory(resolvedDir);
console.log(`\n✅ Done! Updated ${result.updated} out of ${result.total} TypeScript files.`);

if (result.updated > 0) {
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm run build');
  console.log('2. Run tests for this module');
  console.log('3. Fix any issues before proceeding to the next module');
}