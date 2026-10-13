import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type MagicResumeCliConfig = {
  apiUrl: string;
  token?: string;
  defaultResumeId?: string;
};

const CONFIG_PATH = join(homedir(), '.magic-resume', 'mcp.json');

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function hasConfig(): Promise<boolean> {
  try {
    await access(CONFIG_PATH);
    return true;
  } catch (error) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
}

/** Deletes the config file; resolves false when there was none. */
export async function clearConfig(): Promise<boolean> {
  try {
    await rm(CONFIG_PATH);
    return true;
  } catch (error) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
}

export function getDefaultConfig(): MagicResumeCliConfig {
  return {
    apiUrl: 'http://localhost:3110/api',
  };
}

export async function loadConfig(): Promise<MagicResumeCliConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return {
      ...getDefaultConfig(),
      ...JSON.parse(raw),
    };
  } catch (error) {
    if (isFileNotFound(error)) {
      return getDefaultConfig();
    }
    throw error;
  }
}

export async function saveConfig(config: MagicResumeCliConfig): Promise<MagicResumeCliConfig> {
  const nextConfig = {
    ...getDefaultConfig(),
    ...config,
  };

  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, {
    mode: 0o600,
  });

  return nextConfig;
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}
