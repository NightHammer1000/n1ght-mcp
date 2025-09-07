#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

// Import modules
const todoModule = require("./modules/todo/todo.js");
const jsonEditorModule = require("./modules/jsoneditor/jsoneditor.js");
const xmlModule = require("./modules/xml/xml.js");
const tomlModule = require("./modules/toml/toml.js");
const yamlModule = require("./modules/yaml/yaml.js");
const thinkingModule = require("./modules/thinking/thinking.js");
const filesystemModule = require("./modules/filesystem/filesystem.js");

// Create main server
const server = new McpServer({
  name: "n1ght-mcp",
  version: "1.0.0",
});

// Register tools from all modules
todoModule.registerTools(server);
jsonEditorModule.registerTools(server);
xmlModule.registerTools(server);
tomlModule.registerTools(server);
yamlModule.registerTools(server);
thinkingModule.registerTools(server);
filesystemModule.registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // The server will process one request and then exit.
  process.stdout.on('drain', () => {
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
