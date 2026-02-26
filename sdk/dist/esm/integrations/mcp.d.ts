/**
 * AgentLedger integration for MCP (Model Context Protocol) servers.
 *
 * Wraps MCP tool handlers so every tool invocation is logged.
 *
 * Usage with @modelcontextprotocol/sdk:
 *
 *   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 *   import { AgentLedger } from '@agentledger/sdk';
 *   import { wrapMCPServer } from '@agentledger/sdk/integrations/mcp';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *   const server = new McpServer({ name: 'my-server', version: '1.0.0' });
 *
 *   // Register tools normally
 *   server.tool('send_email', { to: z.string(), body: z.string() }, async (args) => {
 *     return await sendEmail(args.to, args.body);
 *   });
 *
 *   // Wrap the server — all tool calls are now logged
 *   wrapMCPServer(ledger, server, { agent: 'my-mcp-server' });
 */
import type { AgentLedger } from '../index';
export interface MCPWrapConfig {
    /** Agent name in AgentLedger */
    agent: string;
    /** Map tool names to AgentLedger service/action. Default: tool name as service, 'invoke' as action */
    serviceMap?: Record<string, {
        service: string;
        action?: string;
    }>;
}
/**
 * Wraps an MCP server instance to log all tool invocations.
 * Works by monkey-patching the tool registration method.
 *
 * Compatible with @modelcontextprotocol/sdk McpServer.
 */
export declare function wrapMCPServer(ledger: AgentLedger, server: MCPServerLike, config: MCPWrapConfig): void;
/**
 * Alternative: wrap a single MCP tool handler function directly.
 *
 * Usage:
 *   server.tool('send_email', schema, wrapMCPTool(ledger, {
 *     agent: 'my-server',
 *     service: 'sendgrid',
 *     action: 'send_email',
 *   }, async (args) => {
 *     return await sendEmail(args.to, args.body);
 *   }));
 */
export declare function wrapMCPTool<TArgs, TResult>(ledger: AgentLedger, options: {
    agent: string;
    service: string;
    action: string;
}, handler: (args: TArgs) => Promise<TResult>): (args: TArgs) => Promise<TResult>;
/**
 * Minimal interface for MCP server compatibility.
 * We don't import @modelcontextprotocol/sdk to keep zero dependencies.
 */
interface MCPServerLike {
    tool: (name: string, ...args: unknown[]) => unknown;
}
export {};
