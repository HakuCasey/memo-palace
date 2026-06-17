import type { Command } from 'commander';
import type { MemoPalaceClient } from '../../api-client.js';

export function registerSelfCheck(program: Command, createClient: () => MemoPalaceClient): void {
  program
    .command('self-check')
    .description('Run a self-check on the memory palace')
    .action(async () => {
      const client = createClient();
      try {
        const result = await client.selfCheck();
        console.log(`Connectivity: ${result.connectivity}`);
        console.log(`DB Health:    ${result.db_health}`);
        console.log(`Memory Stats (Floors & Rooms):`);
        console.log(`  Episodic Floor:  ${result.memory_stats.episodic}  (rooms: debug_case, api_trap, config_trap, dev_note)`);
        console.log(`  Semantic Floor:  ${result.memory_stats.semantic}  (rooms: pattern, best_practice, dev_specification)`);
        console.log(`  Procedural Floor: ${result.memory_stats.procedural}  (rooms: skill, workflow — file-based)`);
      } catch (err: any) {
        console.error('Self-check failed:', err.message);
        process.exit(1);
      }
    });
}
