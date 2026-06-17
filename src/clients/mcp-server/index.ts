import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MemoPalaceClient } from '../api-client.js';
import { registerTools } from './tools.js';

const baseUrl = process.env.MEMOPALACE_URL || 'http://localhost:5678';
const client = new MemoPalaceClient(baseUrl, 'memopalace-mcp/0.1.0');
const server = new McpServer({ name: 'memopalace', version: '0.1.0' });

registerTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
