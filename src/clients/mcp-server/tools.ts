import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MemoPalaceClient } from '../api-client.js';

export const searchSchema = {
  query: z.string().describe('Search query string'),
  layer: z.enum(['episodic', 'semantic']).optional().describe('Memory floor to search'),
  limit: z.number().optional().describe('Maximum number of results'),
  episodic_type: z.enum(['debug_case', 'api_trap', 'config_trap', 'dev_note']).optional().describe('Filter episodic by room type'),
  semantic_type: z.enum(['pattern', 'best_practice', 'dev_specification']).optional().describe('Filter semantic by room type'),
};

export const uploadSchema = {
  title: z.string().describe('Title of the episodic memory'),
  episodic_type: z.enum(['debug_case', 'api_trap', 'config_trap', 'dev_note']).optional().default('debug_case').describe('Episodic room type'),
  trigger: z.object({
    error_signals: z.array(z.string()).describe('Error signal types'),
    error_message: z.string().describe('Error message text'),
    scenario: z.string().describe('Scenario where the error occurred'),
    error_code: z.string().optional().describe('Error code if available'),
  }).describe('Trigger information'),
  resolution: z.object({
    category: z.string(),
    root_cause: z.string(),
    fix_strategy: z.string(),
    fix_description: z.string(),
    key_code_snippet: z.string().optional(),
    validation: z.string().optional(),
  }).optional().describe('Resolution information if resolved'),
};

export async function handleSearch(
  args: { query: string; layer?: 'episodic' | 'semantic'; limit?: number; episodic_type?: string; semantic_type?: string },
  client: MemoPalaceClient,
) {
  const result = await client.search(args.query, { layer: args.layer, limit: args.limit, episodic_type: args.episodic_type, semantic_type: args.semantic_type });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleUpload(
  args: {
    title: string;
    episodic_type?: string;
    trigger: { error_signals: string[]; error_message: string; scenario: string; error_code?: string };
    resolution?: { category: string; root_cause: string; fix_strategy: string; fix_description: string; key_code_snippet?: string; validation?: string };
  },
  client: MemoPalaceClient,
) {
  const result = await client.createEpisodic({
    source: 'manual',
    episodic_type: (args.episodic_type || 'debug_case') as any,
    title: args.title,
    trigger: args.trigger,
    resolution: args.resolution,
  });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleSelfCheck(client: MemoPalaceClient) {
  const result = await client.selfCheck();
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleStatus(client: MemoPalaceClient) {
  const result = await client.getStatus();
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function registerTools(server: McpServer, client: MemoPalaceClient): void {
  server.tool(
    'memopalace_search',
    'Search MemoPalace memory across floors and rooms. Filter by floor (layer), room type (episodic_type/semantic_type), and result limit.',
    searchSchema,
    async (args) => handleSearch(args, client),
  );

  server.tool(
    'memopalace_upload',
    'Upload episodic memory to a specific room (debug_case, api_trap, config_trap, dev_note) in the episodic floor.',
    uploadSchema,
    async (args) => handleUpload(args, client),
  );

  server.tool(
    'memopalace_self_check',
    'Run self-check on MemoPalace server — reports DB health and per-floor memory counts.',
    {},
    async () => handleSelfCheck(client),
  );

  server.tool(
    'memopalace_status',
    'Get MemoPalace server status — uptime, memory counts per floor, and pending evolution tasks.',
    {},
    async () => handleStatus(client),
  );
}
