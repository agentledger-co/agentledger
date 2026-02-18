"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapMCPServer = wrapMCPServer;
exports.wrapMCPTool = wrapMCPTool;
/**
 * Wraps an MCP server instance to log all tool invocations.
 * Works by monkey-patching the tool registration method.
 *
 * Compatible with @modelcontextprotocol/sdk McpServer.
 */
function wrapMCPServer(ledger, server, config) {
    const originalTool = server.tool.bind(server);
    server.tool = function wrappedTool(name, ...rest) {
        // tool(name, schema, handler) or tool(name, description, schema, handler)
        // The handler is always the last argument
        const handler = rest[rest.length - 1];
        const otherArgs = rest.slice(0, -1);
        const wrappedHandler = async (...handlerArgs) => {
            const mapped = config.serviceMap?.[name];
            const { result } = await ledger.track({
                agent: config.agent,
                service: mapped?.service || name,
                action: mapped?.action || 'invoke',
                metadata: {
                    source: 'mcp',
                    toolName: name,
                    argsPreview: JSON.stringify(handlerArgs[0]).slice(0, 500),
                },
            }, () => handler(...handlerArgs));
            return result;
        };
        return originalTool(name, ...otherArgs, wrappedHandler);
    };
}
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
function wrapMCPTool(ledger, options, handler) {
    return async (args) => {
        const { result } = await ledger.track({
            agent: options.agent,
            service: options.service,
            action: options.action,
            metadata: {
                source: 'mcp',
                argsPreview: JSON.stringify(args).slice(0, 500),
            },
        }, () => handler(args));
        return result;
    };
}
