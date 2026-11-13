import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

// FORMAT DIMENSIONS
function roundDimensions(value) {
  if (typeof value === "number") {
    return Number(value.toFixed(2));
  }

  if (Array.isArray(value)) {
    return value.map(roundDimensions);
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = roundDimensions(item);
    }

    return result;
  }

  return value;
}

// FORMAT UNIX TIMESTAMP
function formatDate(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp * 1000);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

// CREATE MCP SERVER
function createServer() {
  const server = new McpServer({
    name: "polyhaven-mcp",
    version: "1.0.0"
  });

  // TEST CONNECTION
  server.registerTool(
    "test_connection",
    {
      description: "Check whether the Poly Haven MCP server is online.",
      inputSchema: {}
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
        "Search for 3D models and other assets in the Poly Haven library.",
      inputSchema: {
        query: z.string().trim().min(1).max(100),
        limit: z.number().int().min(1).max(20).default(5)
      }
    },
    async ({ query, limit }) => {
      const url =
        `https://api.polyhaven.com/search?q=${encodeURIComponent(query)}&t=models&limit=${limit}`;

      const response = await fetch(url, {
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

      const entries = Array.isArray(data)
        ? data
        : Object.entries(data).map(([slug, item]) => ({
            slug,
            ...(typeof item === "object" ? item : {
              score: item
            })
          }));

      entries.sort(
        (a, b) => (b.score || 0) - (a.score || 0)
      );

      const results = await Promise.all(
        entries.slice(0, limit).map(async (item) => {
          const assetId = item.slug || item.id;

          try {
            const infoResponse = await fetch(
              `https://api.polyhaven.com/info/${encodeURIComponent(assetId)}`
            );

            const info = infoResponse.ok
              ? await infoResponse.json()
              : {};

            return {
              id: assetId,
              name: info.name || assetId,
              description: info.description || "",
              category: info.category || "",
              thumbnail_url: info.thumbnail_url || "",
              score: item.score || 0,
              url: `https://polyhaven.com/a/${assetId}`
            };
          } catch {
            return {
              id: assetId,
              name: assetId,
              score: item.score || 0,
              url: `https://polyhaven.com/a/${assetId}`
            };
          }
        })
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            source: "Poly Haven",
            query,
            total_results: entries.length,
            results
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
      inputSchema: {
        asset_id: z.string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_-]+$/)
          .describe("The asset ID returned by search_assets")
      }
    },
    async ({ asset_id }) => {
      const response = await fetch(
        `https://api.polyhaven.com/info/${encodeURIComponent(asset_id)}`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "PolyHavenMCP/1.0"
          }
        }
      );

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

      const dimensions = info.dimensions
        ? {
            unit: "meters",
            values: roundDimensions(info.dimensions)
          }
        : null;

      const result = {
        source: "Poly Haven",
        asset_id,
        name: info.name || asset_id,
        description: info.description || "",
        type: info.type || "",
        category: info.category || "",
        tags: info.tags || [],
        thumbnail: info.thumbnail_url || "",
        authors: info.authors || {},
        download_count: info.download_count ?? 0,
        date_published: formatDate(info.date_published),
        max_resolution: info.max_resolution || null,
        attributes: info.attributes || {},
        dimensions,
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

// MCP HANDLER
const handler = createMcpHandler(createServer);

export default {
  fetch(request, env, ctx) {
    return handler(request, env, ctx);
  }
};
