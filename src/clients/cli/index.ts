#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoPalaceClient } from '../api-client.js';
import { registerSearch } from './commands/search.js';
import { registerUpload } from './commands/upload.js';
import { registerSelfCheck } from './commands/self-check.js';
import { registerStatus } from './commands/status.js';
import { registerConfig } from './commands/config.js';

const CONFIG_DIR = path.join(os.homedir(), '.memopalace');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, string> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config: Record<string, string>): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function getBaseUrl(): string {
  const envUrl = process.env.MEMOPALACE_URL;
  if (envUrl) return envUrl;
  const config = loadConfig();
  return config.baseUrl || 'http://localhost:5678';
}

function createClient(): MemoPalaceClient {
  return new MemoPalaceClient(getBaseUrl(), 'memopalace-cli/0.1.0');
}

export { loadConfig, saveConfig, getBaseUrl, createClient, CONFIG_DIR, CONFIG_PATH };

const program = new Command();

program
  .name('memopalace')
  .description('MemoPalace CLI — self-evolving memory palace for code agents')
  .version('0.1.0');

registerSearch(program, createClient);
registerUpload(program, createClient);
registerSelfCheck(program, createClient);
registerStatus(program, createClient);
registerConfig(program, () => getBaseUrl(), loadConfig, saveConfig);

program.parseAsync().then(() => {
  process.exit(0);
}).catch((err: any) => {
  console.error(err.message);
  process.exit(1);
});
