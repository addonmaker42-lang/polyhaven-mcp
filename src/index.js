import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

function createServer() {
  const server = new McpServer({
    name: "polyhaven-mcp",
    version: "1.0.0"
  });

  // CONNECTION TEST
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

  // SEARCH ASSETS
  server.registerTool(
    "search_assets",
    {
      description:
        "Search 3D models in the Poly Haven library using natural language. Returns matching asset names, descriptions, categories, thumbnails and relevance scores.",
      inputSchema: z.object({
        query: z.string()
          .trim()
          .min(1)
          .max(100)
          .describe("What 3D model to search for"),

        limit: z.number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Maximum number of results")
      })
    },
    async ({ query, limit }) => {
      const searchUrl = new URL(
        "https://api.polyhaven.com/search"
      );

      searchUrl.searchParams.set(
        "q",
        query.trim().toLowerCase()
      );

      searchUrl.searchParams.set("t", "models");
      searchUrl.searchParams.set("limit", String(limit));

      const response = await fetch(searchUrl.toString(), {
        headers: {
          "Accept": "application/json",
          "User-Agent": "PolyHavenMCP/1.0"
        }
      });

      if (!response.ok) {
        throw new Error(
          `Poly Haven API error: HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No 3D models found for: ${query}`
          }]
        };
      }

      const results = await Promise.all(
        data.results.slice(0, limit).map(async (item) => {
          try {
            const infoResponse = await fetch(
              `https://api.polyhaven.com/info/${encodeURIComponent(item.slug)}`
            );

            if (!infoResponse.ok) {
              return {
                id: item.slug,
                score: item.score,
                name: item.slug,
                error: "Metadata unavailable"
              };
            }

            const info = await infoResponse.json();

            return {
              id: item.slug,
              name: info.name || item.slug,
              description: info.description || "",
              category: info.category || "",
              thumbnail: info.thumbnail_url || "",
              score: item.score,
              source: "Poly Haven"
            };
          } catch {
            return {
              id: item.slug,
              name: item.slug,
              score: item.score,
              error: "Could not retrieve metadata"
            };
          }
        })
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            source: "Poly Haven",
            credit: "Powered by Poly Haven",
            query: query,
            total: data.total,
            returned: results.length,
            results: results
          }, null, 2)
        }]
      };
    }
  );

  // GET ASSET INFO
  server.registerTool(
    "get_asset_info",
    {
      description:
        "Get detailed information about a Poly Haven asset using its asset ID.",
      inputSchema: z.object({
        asset_id: z.string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_-]+$/)
          .describe("The asset ID returned by search_assets")
      })
    },
    async ({ asset_id }) => {
      const url =
        `https://api.polyhaven.com/info/${encodeURIComponent(asset_id)}`;

      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "PolyHavenMCP/1.0"
        }
      });

      if (response.status === 404) {
        return {
          content: [{
            type: "text",
            text: `Asset not found: ${asset_id}`
          }],
          isError: true
        };
      }

      if (!response.ok) {
        throw new Error(
          `Poly Haven API error: HTTP ${response.status}`
        );
      }

      const info = await response.json();

      const result = {
        source: "Poly Haven",
        asset_id,
        name: info.name || asset_id,
        description: info.description || "",
        type: info.type,
        category: info.category || "",
        tags: info.tags || [],
        thumbnail: info.thumbnail_url || "",
        authors: info.authors || {},
        download_count: info.download_count ?? 0,
        date_published: info.date_published ?? null,
        max_resolution: info.max_resolution || null,
        attributes: info.attributes || {},
        dimensions: info.dimensions || null,
        polyhaven_url: `https://polyhaven.com/a/${asset_id}`
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );
  
  return server;
}

const handler = createMcpHandler(createServer);

export default {
  fetch(request, env, ctx) {
    return handler(request, env, ctx);
  }
};
