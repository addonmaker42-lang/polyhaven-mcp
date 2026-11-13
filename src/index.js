
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

function createServer() {
  const server = new McpServer({
    name: "polyhaven-mcp",
    version: "1.0.0"
  });

  server.registerTool(
    "test_connection",
    {
      description: "Test the Poly Haven MCP connection.",
      inputSchema: {}
    },
    async () => ({
      content: [{
        type: "text",
        text: "Poly Haven MCP is online and ready!"
      }]
    })
  );

  return server;
}

const handler = createMcpHandler(createServer);

export default {
  fetch(request, env, ctx) {
    return handler(request, env, ctx);
  }
};
