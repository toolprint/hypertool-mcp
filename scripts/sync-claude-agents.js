#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

async function findClaudeFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
      files.push(...await findClaudeFiles(res));
    } else if (entry.isFile() && entry.name === 'CLAUDE.md') {
      files.push(res);
    }
  }
  return files;
}

function buildAgentsContent(claudeContent, existing) {
  const marker = '## CLAUDE Source';
  const trimmed = claudeContent.trim();
  if (existing && existing.includes(marker)) {
    const before = existing.split(marker)[0];
    return `${before}${marker}\n\n${trimmed}\n`;
  }
  return `${trimmed}\n`;
}

async function sync() {
  const root = process.cwd();
  const claudeFiles = await findClaudeFiles(root);
  await Promise.all(claudeFiles.map(async (file) => {
    const claudeContent = await fs.readFile(file, 'utf-8');
    const dir = path.dirname(file);
    const agentsPath = path.join(dir, 'AGENTS.md');
    let existing = '';
    try { existing = await fs.readFile(agentsPath, 'utf-8'); } catch {}
    const updated = buildAgentsContent(claudeContent, existing);
    await fs.writeFile(agentsPath, updated, 'utf-8');
  }));
  console.log(`Synced ${claudeFiles.length} CLAUDE.md file(s) to AGENTS.md`);
}

sync().catch(err => { console.error(err); process.exit(1); });
