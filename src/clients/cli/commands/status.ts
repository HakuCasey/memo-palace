import type { Command } from 'commander';
import type { MemoPalaceClient } from '../../api-client.js';

export function registerStatus(program: Command, createClient: () => MemoPalaceClient): void {
  program
    .command('status')
    .description('Show server status')
    .action(async () => {
      const client = createClient();
      try {
        const status = await client.getStatus();
        const uptimeSec = Math.floor(status.uptime);
        const hours = Math.floor(uptimeSec / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);
        const secs = uptimeSec % 60;
        console.log(`Uptime: ${hours}h ${mins}m ${secs}s`);
        console.log(`Episodic Floor:   ${status.memory_counts.episodic}  (debug_case, api_trap, config_trap, dev_note)`);
        console.log(`Semantic Floor:   ${status.memory_counts.semantic}  (pattern, best_practice, dev_specification)`);
        console.log(`Procedural Floor: ${status.memory_counts.procedural}  (skill, workflow — file-based)`);
        console.log(`Pending evolution tasks: ${status.pending_tasks}`);
      } catch (err: any) {
        console.error('Status failed:', err.message);
        process.exit(1);
      }
    });
}
