# generate-mcp-from-service-action

Public GitHub Action that calls a private MCP generator service (`POST /generate`),
downloads the generated MCP package zip, and optionally uploads it as a workflow artifact.

## What it does

1. Reads your OpenAPI spec file from the workflow workspace.
2. Calls your private generator endpoint using a customer API key header.
3. Downloads the returned package ZIP to a local path.
4. Exposes outputs for downstream steps/jobs.
5. Optionally uploads the ZIP as a GitHub artifact for deployment handoff.

## Required secret handling

Do **not** commit API keys. Store them in GitHub Secrets and pass them at runtime:

- `MCP_GENERATOR_URL`
- `MCP_CUSTOMER_API_KEY`

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `endpoint-url` | Yes | — | Full `POST /generate` URL for your private service |
| `spec-path` | Yes | — | Path to OpenAPI file in workspace |
| `customer-api-key` | Yes | — | Paid customer API key |
| `customer-api-key-header` | No | `x-customer-api-key` | Header name for API key |
| `output-name` | No | — | Optional generated package name override |
| `language` | No | `typescript` | `typescript`, `python`, or `java` |
| `transport-type` | No | `stdio` | `stdio` or `httpStream` |
| `http-port` | No | `3000` | Port when `transport-type=httpStream` |
| `support-auth` | No | `true` | Include auth helpers in generated client |
| `output-zip-path` | No | temp path | Local destination for downloaded ZIP |
| `upload-artifact` | No | `false` | Upload generated ZIP as workflow artifact |
| `artifact-name` | No | `mcp-server-package` | Artifact name for upload/download |
| `artifact-retention-days` | No | `7` | Retention days when uploading artifact |

## Outputs

| Output | Description |
|---|---|
| `download-url` | ZIP download URL returned by generator |
| `zip-path` | Local path of downloaded ZIP file |
| `package-title` | API title reported by generator |
| `package-version` | API version reported by generator |
| `operation-count` | Number of generated operations |
| `artifact-name` | Artifact name to use in downstream download step |

## Example: generate + upload artifact in one step

```yaml
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate MCP package
        id: mcp
        uses: MCPGenerator/generate-mcp-from-service-action@main
        with:
          endpoint-url: ${{ secrets.MCP_GENERATOR_URL }}
          spec-path: ./openapi.json
          customer-api-key: ${{ secrets.MCP_CUSTOMER_API_KEY }}
          upload-artifact: "true"
          artifact-name: mcp-server-package
```

## Example: downstream deployment job

```yaml
jobs:
  generate:
    runs-on: ubuntu-latest
    outputs:
      artifact_name: ${{ steps.mcp.outputs.artifact-name }}
    steps:
      - uses: actions/checkout@v4
      - id: mcp
        uses: MCPGenerator/generate-mcp-from-service-action@main
        with:
          endpoint-url: ${{ secrets.MCP_GENERATOR_URL }}
          spec-path: ./openapi.json
          customer-api-key: ${{ secrets.MCP_CUSTOMER_API_KEY }}
          upload-artifact: "true"
          artifact-name: mcp-server-package

  deploy:
    needs: generate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.generate.outputs.artifact_name }}
          path: ./artifact

      - name: Deploy MCP server package
        run: |
          ls -la ./artifact
          # unzip/build/deploy with your platform-specific commands
```

## Notes

- Keep this action public, and keep your generator backend private.
- API-key validation and paid-entitlement checks live in your private backend.
