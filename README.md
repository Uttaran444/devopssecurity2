
# MCP Azure DevOps Server (TypeScript)

A production-ready Model Context Protocol (MCP) server written in TypeScript that connects to Azure DevOps using Microsoft Entra ID **On-Behalf-Of (OBO)**. Designed to be hosted on **Azure App Service** and added as a tool in **Copilot Studio**.

## Features
- MCP Streamable HTTP transport at `POST /mcp`
- Tools:
  - `ado_list_projects`: Lists projects in a given Azure DevOps organization
  - `ado_query_wiql`: Runs a WIQL query and returns work item IDs
- Secure OBO token exchange using `@azure/msal-node`
- ESM-ready TypeScript configuration (Node 18+)
- GitHub Actions workflow for Azure Web Apps deployment

## 1. Prerequisites
- Node.js 18 or 20
- Azure subscription with App Service (Linux)
- Microsoft Entra ID admin access
- Azure DevOps organization linked to the tenant

## 2. Entra ID App Registrations
Create **two** app registrations:

### 2.1 MCP Server API (Web API)
1. **Expose an API** → Set _Application ID URI_ (e.g., `api://<MCP_API_CLIENT_ID>`)
2. **Add scope**: `access_as_user` (Enabled; Admins & users)
3. **Certificates & secrets** → New client secret (use in `.env`)
4. **API permissions** → Add **Azure DevOps** resource; grant delegated scopes as required; **Grant admin consent**.

### 2.2 Copilot Client (used by Copilot Studio tool)
1. **Authentication** → **Add platform** → **Web**
2. **Redirect URI**: `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`
3. **API permissions** → **My APIs** → select your **MCP Server API** → **Delegated** → `access_as_user` → **Grant admin consent**.

## 3. Copilot Studio OAuth Settings
When adding the MCP server tool:
- **Authorization URL**: `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/authorize`
- **Token URL**: `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token`
- **Refresh URL**: same as Token URL
- **Scopes**: `api://<Application-ID-URI>/access_as_user openid profile offline_access`

## 4. Configuration
Create `.env` from `.env.example` and set:
```
TENANT_ID=...           # Your directory tenant ID
MCP_API_CLIENT_ID=...   # Client ID of the MCP Server API app
MCP_API_CLIENT_SECRET=... # Secret of the MCP Server API app
ADO_ORG=contoso         # Azure DevOps organization short name
ADO_API_VERSION=7.2     # Optional; default 7.2
PORT=3000               # Optional
```

## 5. Run locally
```bash
npm ci
npm run dev
```
POST to `http://localhost:3000/mcp` with MCP client to test.

## 6. Deploy to Azure App Service via GitHub Actions
1. Create an App Service (Linux, Node runtime)
2. In App Service **Configuration**, add the same environment variables as `.env`
3. In GitHub repo Settings → Secrets and variables → Actions, add:
   - `AZURE_WEBAPP_NAME` = your App Service name
   - `AZURE_WEBAPP_PUBLISH_PROFILE` = content of the Publish Profile (download from App Service → Overview)
4. Push this repo; the workflow will build and deploy.

## 7. Health check
`GET /healthz` returns `ok`.

## 8. Troubleshooting
- **Tools not showing**: Verify Copilot client app has **Web** platform with Teams redirect and delegated permission `access_as_user` to your MCP API.
- **401/invalid_client**: Check the **client secret** and Application ID URI. Ensure scopes in Copilot match the URI: `api://<Application-ID-URI>/access_as_user`.
- **OBO fails**: Confirm the incoming token is a **user** token (not app-only). OBO only works for user principals.

---
Auth resource for Azure DevOps: `499b84ac-1321-427f-aa17-267ca6975798/.default`.
