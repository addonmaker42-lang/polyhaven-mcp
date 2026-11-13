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
      inputSchema: z.object({})
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

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer)(
      request,
      env,
      ctx
    );
  }
};
