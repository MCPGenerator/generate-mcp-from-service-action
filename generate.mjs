import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function getRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required input: ${name}`);
  return value;
}

function normalizeBoolean(raw, fallback = true) {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid boolean value "${raw}"`);
}

function writeOutput(key, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `${key}=${String(value)}\n`, "utf8");
}

function parseResponseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function run() {
  const endpointUrl = getRequired("INPUT_ENDPOINT_URL");
  const specPathInput = getRequired("INPUT_SPEC_PATH");
  const customerApiKey = getRequired("INPUT_CUSTOMER_API_KEY");

  const customerApiKeyHeader = process.env.INPUT_CUSTOMER_API_KEY_HEADER?.trim() || "x-customer-api-key";
  const outputName = process.env.INPUT_OUTPUT_NAME?.trim() || "";
  const language = process.env.INPUT_LANGUAGE?.trim() || "typescript";
  const transportType = process.env.INPUT_TRANSPORT_TYPE?.trim() || "stdio";
  const supportAuth = normalizeBoolean(process.env.INPUT_SUPPORT_AUTH, true);

  const rawHttpPort = process.env.INPUT_HTTP_PORT?.trim() || "3000";
  const httpPort = Number.parseInt(rawHttpPort, 10);
  if (!Number.isInteger(httpPort) || httpPort <= 0) {
    throw new Error(`Invalid http port: ${rawHttpPort}`);
  }

  const specPath = path.resolve(specPathInput);
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec file not found: ${specPath}`);
  }

  const outputZipPath = process.env.INPUT_OUTPUT_ZIP_PATH?.trim()
    ? path.resolve(process.env.INPUT_OUTPUT_ZIP_PATH.trim())
    : path.join(os.tmpdir(), `generated-mcp-${Date.now()}.zip`);

  const fileBuffer = fs.readFileSync(specPath);
  const transportConfig = transportType === "httpStream"
    ? { transport: { type: "httpStream", port: httpPort } }
    : { transport: { type: "stdio" } };

  const form = new FormData();
  form.append("specFile", new Blob([fileBuffer]), path.basename(specPath));
  form.append("language", language);
  form.append("supportAuth", supportAuth ? "true" : "false");
  form.append("transportConfig", JSON.stringify(transportConfig));
  if (outputName) form.append("outputName", outputName);

  const generateResponse = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      [customerApiKeyHeader]: customerApiKey,
    },
    body: form,
  });

  const generateText = await generateResponse.text();
  const generateBody = parseResponseBody(generateText);

  if (!generateResponse.ok) {
    const errorMessage = typeof generateBody === "object" && generateBody && "error" in generateBody
      ? String(generateBody.error)
      : generateText;
    throw new Error(`Generation request failed (${generateResponse.status}): ${errorMessage}`);
  }

  if (!generateBody || typeof generateBody !== "object" || !("downloadUrl" in generateBody)) {
    throw new Error("Generator response did not include downloadUrl.");
  }

  const downloadUrl = String(generateBody.downloadUrl);
  const downloadResponse = await fetch(downloadUrl);
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download generated package (${downloadResponse.status}) from ${downloadUrl}`);
  }

  const zipArrayBuffer = await downloadResponse.arrayBuffer();
  fs.mkdirSync(path.dirname(outputZipPath), { recursive: true });
  fs.writeFileSync(outputZipPath, Buffer.from(zipArrayBuffer));

  writeOutput("download-url", downloadUrl);
  writeOutput("zip-path", outputZipPath);
  writeOutput("package-title", generateBody.title ?? "");
  writeOutput("package-version", generateBody.version ?? "");
  writeOutput("operation-count", generateBody.operationCount ?? "");

  console.log(`Generated MCP package zip: ${outputZipPath}`);
}

run().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
