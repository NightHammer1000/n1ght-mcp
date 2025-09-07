# n1ght-mcp

MCP server toolkit born from real-world needs. Started as a simple JSON editor to overcome AI limitations with large files, evolved into a comprehensive toolkit for daily development work.

## Features

- **Task Management**: Complete task tracking with priorities and progress
- **Data Format Editors**: Professional JSON, XML, TOML, and YAML manipulation (37 tools total)
- **Sequential Thinking**: Structured problem-solving framework
- **Token-Aware File Reading**: Smart file operations with Claude token counting

## Quick Start

### Using npx (recommended)
```bash
npx github:NightHammer1000/n1ght-mcp
```

### Clone and Run
```bash
git clone https://github.com/NightHammer1000/n1ght-mcp.git
cd n1ght-mcp
npm install
node app.js
```

### Integration with Claude Desktop

Add to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "n1ght-mcp": {
      "command": "npx",
      "args": ["github:NightHammer1000/n1ght-mcp"]
    }
  }
}
```

## Configuration

Create `.n1ght.json` in your project root for custom settings:
```json
{
  "filesystem": {
    "maxInputTokens": 200000,
    "maxInputSize": 10485760
  }
}
```

## Available Tools

### Task Management
- `list`, `add`, `remove`, `priority`, `status`, `progress`

### JSON Operations (13 tools)
- `json_read`, `json_write`, `json_get`, `json_set`, `json_delete`
- `json_validate`, `json_query`, `json_search`, `json_structure`
- Plus more for creation, formatting, and analysis

### XML Operations (8 tools)
- Full XML parsing, validation, and manipulation

### TOML Operations (8 tools)
- TOML v0.5.0 compliant configuration handling

### YAML Operations (8 tools)
- Multi-document YAML support with full manipulation

### Thinking Tools (3 tools)
- Sequential problem-solving with revision and branching

### File System (3 tools)
- Token-aware file reading with size limits

## License

MIT

## Support

[GitHub Issues](https://github.com/NightHammer1000/n1ght-mcp/issues)