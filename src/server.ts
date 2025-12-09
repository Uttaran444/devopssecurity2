
import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { z } from 'zod';
import { ConfidentialClientApplication } from '@azure/msal-node';
// MCP SDK imports (ESM subpaths include explicit .js extensions)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/transport/http.js';

dotenv.config();

const TENANT_ID = process.env.TENANT_ID ?? '';
const MCP_API_CLIENT_ID = process.env.MCP_API_CLIENT_ID ?? '';
const MCP_API_CLIENT_SECRET = process.env.MCP_API_CLIENT_SECRET ?? '';
const ADO_ORG = process.env.ADO_ORG ?? '';
const ADO_API_VERSION = process.env.ADO_API_VERSION ?? '7.2';
const PORT = Number(process.env.PORT ?? 3000);

if (!TENANT_ID || !MCP_API_CLIENT_ID || !MCP_API_CLIENT_SECRET) {
  console.warn('[WARN] Missing essential env vars TENANT_ID/MCP_API_CLIENT_ID/MCP_API_CLIENT_SECRET');
}

const authority = `https://login.microsoftonline.com/${TENANT_ID}`;
const cca = new ConfidentialClientApplication({
  auth: {
    clientId: MCP_API_CLIENT_ID,
    authority,
    clientSecret: MCP_API_CLIENT_SECRET,
  },
});

const ADO_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

async function getAdoAccessToken(onBehalfOfToken: string): Promise<string> {
  const result = await cca.acquireTokenOnBehalfOf({
    oboAssertion: onBehalfOfToken,
    scopes: [ADO_SCOPE],
  });
  if (!result?.accessToken) {
    throw new Error('OBO failed: no access token');
  }
  return result.accessToken;
}

function extractBearer(headers: Record<string, any>): string {
  const auth = headers?.authorization || headers?.Authorization;
  if (!auth || typeof auth !== 'string') {
    throw new Error('Missing Authorization header');
  }
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    throw new Error('Authorization header must be a Bearer token');
  }
  return m[1];
}

// Create MCP server
const mcpServer = new Server({ name: 'ado-mcp-server', version: '1.0.0' });

// Tool: List Azure DevOps projects
mcpServer.tool(
  'ado_list_projects',
  'Lists projects for the configured Azure DevOps organization',
  z.object({}),
  async (_input, ctx) => {
    const userToken = extractBearer(ctx?.transportContext?.headers ?? {});
    const adoToken = await getAdoAccessToken(userToken);
    const url = `https://dev.azure.com/${ADO_ORG}/_apis/projects?api-version=${ADO_API_VERSION}`;
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${adoToken}` },
    });
    const projects = (resp.data?.value ?? []).map((p: any) => ({ id: p.id, name: p.name }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ projects }, null, 2) }],
      structuredContent: { projects },
    };
  }
);

// Tool: Run WIQL and return work item IDs
mcpServer.tool(
  'ado_query_wiql',
  'Runs a WIQL query and returns work item IDs',
  z.object({ wiql: z.string() }),
  async (input, ctx) => {
    const userToken = extractBearer(ctx?.transportContext?.headers ?? {});
    const adoToken = await getAdoAccessToken(userToken);
    const url = `https://dev.azure.com/${ADO_ORG}/_apis/wit/wiql?api-version=${ADO_API_VERSION}`;
    const resp = await axios.post(
      url,
      { query: input.wiql },
      { headers: { Authorization: `Bearer ${adoToken}` } }
    );
    const ids = (resp.data?.workItems ?? []).map((w: any) => w.id);
    return {
      content: [{ type: 'text', text: JSON.stringify({ ids }, null, 2) }],
      structuredContent: { ids },
    };
  }
);

// Express + Streamable HTTP transport
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  // Pass incoming headers (includes Authorization from Copilot Studio OAuth)
  transport.setServerContext({ headers: req.headers });
  res.on('close', () => transport.close());

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`[mcp-ado-server] listening on port ${PORT}`);
});
