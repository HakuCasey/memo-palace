import type { Command } from 'commander';

export function registerConfig(
  program: Command,
  getBaseUrl: () => string,
  loadConfig: () => Record<string, string>,
  saveConfig: (config: Record<string, string>) => void,
): void {
  program
    .command('config [key] [value]')
    .description('Get or set configuration values')
    .action((key?: string, value?: string) => {
      const config = loadConfig();

      if (!key) {
        console.log(JSON.stringify({ baseUrl: getBaseUrl(), ...config }, null, 2));
        return;
      }

      if (value === undefined) {
        console.log(config[key] ?? '');
        return;
      }

      config[key] = value;
      saveConfig(config);
      console.log(`${key} = ${value}`);
    });
}
