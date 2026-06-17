import type { Command } from 'commander';
import type { MemoPalaceClient } from '../../api-client.js';
import * as fs from 'fs';

export function registerUpload(program: Command, createClient: () => MemoPalaceClient): void {
  program
    .command('upload [file]')
    .description('Upload an episodic memory from a JSON file or stdin. Required fields: episodic_type, source, title, trigger. Optional: resolution, context, tags.')
    .option('--episodic-type <room>', 'Episodic room type (debug_case, api_trap, config_trap, dev_note)')
    .action(async (file?: string, opts?: { episodicType?: string }) => {
      const client = createClient();
      try {
        let raw: string;

        if (file) {
          raw = fs.readFileSync(file, 'utf-8');
        } else {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk as Buffer);
          }
          raw = Buffer.concat(chunks).toString('utf-8');
        }

        const data = JSON.parse(raw);
        if (opts?.episodicType && !data.episodic_type) {
          data.episodic_type = opts.episodicType;
        }
        const result = await client.createEpisodic(data);
        console.log(`Created episodic memory: ${result.id} (room: ${result.episodic_type})`);
      } catch (err: any) {
        console.error('Upload failed:', err.message);
        process.exit(1);
      }
    });
}
