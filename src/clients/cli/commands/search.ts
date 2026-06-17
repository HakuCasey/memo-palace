import type { Command } from 'commander';
import type { MemoPalaceClient } from '../../api-client.js';
import type { ProceduralMemory, SemanticMemory, EpisodicMemory } from '../../../server/types.js';

function formatProcedural(items: ProceduralMemory[]): string {
  if (items.length === 0) return '';
  const lines: string[] = ['\n=== Procedural ==='];
  for (const p of items) {
    lines.push(`  [${p.priority}] ${p.name}`);
    lines.push(`      ${p.description}`);
    lines.push(`      trigger: ${p.trigger.type} / ${p.trigger.pattern}  enabled: ${p.enabled}`);
  }
  return lines.join('\n');
}

function formatEpisodic(items: EpisodicMemory[]): string {
  if (items.length === 0) return '';
  const lines: string[] = ['\n=== Episodic ==='];
  for (const e of items) {
    lines.push(`  [${e.episodic_type}] [${e.tags.severity}] ${e.title}  (${e.status})`);
    lines.push(`      ${e.trigger.error_message}`);
    if (e.trigger.error_code) {
      lines.push(`      error code: ${e.trigger.error_code}`);
    }
    if (e.resolution) {
      lines.push(`      fix: ${e.resolution.fix_description}`);
    }
  }
  return lines.join('\n');
}

function formatSemantic(items: SemanticMemory[]): string {
  if (items.length === 0) return '';
  const lines: string[] = ['\n=== Semantic ==='];
  for (const s of items) {
    lines.push(`  [${s.semantic_type}] [${s.category}] ${s.title}  (confidence: ${s.confidence})`);
    lines.push(`      ${s.knowledge}`);
    if (s.conditions.error_codes?.length) {
      lines.push(`      error codes: ${s.conditions.error_codes.join(', ')}`);
    }
  }
  return lines.join('\n');
}

export function registerSearch(program: Command, createClient: () => MemoPalaceClient): void {
  program
    .command('search <query>')
    .description('Search memory palace across floors and rooms')
    .option('-l, --layer <floor>', 'Filter by floor (episodic, semantic)')
    .option('--episodic-type <room>', 'Filter episodic by room (debug_case, api_trap, config_trap, dev_note)')
    .option('--semantic-type <room>', 'Filter semantic by room (pattern, best_practice, dev_specification)')
    .option('-n, --limit <number>', 'Max results per floor', '20')
    .action(async (query: string, opts: { layer?: string; episodicType?: string; semanticType?: string; limit?: string }) => {
      const client = createClient();
      try {
        const options: { layer?: 'episodic' | 'semantic'; limit?: number; episodic_type?: string; semantic_type?: string } = {};
        if (opts.layer) options.layer = opts.layer as any;
        if (opts.limit) options.limit = parseInt(opts.limit, 10);
        if (opts.episodicType) options.episodic_type = opts.episodicType;
        if (opts.semanticType) options.semantic_type = opts.semanticType;

        const result = await client.search(query, options);

        const parts: string[] = [];
        const procStr = formatProcedural(result.procedural);
        const semStr = formatSemantic(result.semantic);
        const epiStr = formatEpisodic(result.episodic);

        if (procStr) parts.push(procStr);
        if (semStr) parts.push(semStr);
        if (epiStr) parts.push(epiStr);

        if (parts.length === 0) {
          console.log('No results found.');
        } else {
          console.log(parts.join('\n'));
        }
      } catch (err: any) {
        console.error('Search failed:', err.message);
        process.exit(1);
      }
    });
}
