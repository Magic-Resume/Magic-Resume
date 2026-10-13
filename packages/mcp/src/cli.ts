#!/usr/bin/env node

import { clearConfig, getConfigPath, hasConfig, loadConfig, saveConfig } from './config.js';
import { startMcpServer } from './server.js';

const [, , command, subcommand, ...args] = process.argv;

try {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
  } else if (command === 'mcp') {
    await startMcpServer();
  } else if (command === 'config' && subcommand === 'set') {
    await handleConfigSet(args);
  } else if (command === 'config' && subcommand === 'print') {
    await handleConfigPrint();
  } else if (command === 'config' && subcommand === 'clear') {
    await handleConfigClear();
  } else {
    printUsage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function handleConfigSet(args: string[]): Promise<void> {
  const apiUrl = readOption(args, '--api-url');
  const token = readOption(args, '--pat');
  const defaultResumeId = readOption(args, '--default-resume-id');

  if (!apiUrl || !token) {
    throw new Error('Missing required options: --api-url and --pat');
  }

  await saveConfig({
    apiUrl,
    token,
    defaultResumeId,
  });

  console.log('Magic Resume MCP config saved.');
}

async function handleConfigPrint(): Promise<void> {
  const path = getConfigPath();
  if (!(await hasConfig())) {
    console.log(`No config at ${path}. Run: magic-resume config set --api-url <url> --pat <token>`);
    return;
  }

  const config = await loadConfig();
  console.log(`Config file:    ${path}`);
  console.log(`API URL:        ${config.apiUrl}`);
  console.log(`PAT:            ${config.token ? maskToken(config.token) : '(not set)'}`);
  console.log(`Default resume: ${config.defaultResumeId ?? '(not set)'}`);
}

async function handleConfigClear(): Promise<void> {
  const path = getConfigPath();
  console.log((await clearConfig()) ? `Removed ${path}.` : `No config at ${path}; nothing to clear.`);
}

/** Enough of the PAT to tell which one is configured, never enough to use it. */
function maskToken(token: string): string {
  return token.length > 12 ? `${token.slice(0, 7)}…${token.slice(-4)}` : '****';
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function printUsage(): void {
  console.log('Magic Resume CLI');
  console.log('Usage:');
  console.log('  magic-resume config set --api-url <url> --pat <token> [--default-resume-id <id>]');
  console.log('  magic-resume config print   show the saved config (PAT masked)');
  console.log('  magic-resume config clear   delete the saved config');
  console.log('  magic-resume mcp');
}
