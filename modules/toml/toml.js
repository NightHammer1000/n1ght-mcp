const { z } = require("zod");
const fs = require('fs').promises;
const TOML = require('@iarna/toml');

// Professional TOML Handler using @iarna/toml
class TOMLHandler {
  constructor() {
    this.maxFileSize = 500 * 1024 * 1024; // 500MB limit
  }

  async readTOML(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      const data = TOML.parse(content);
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Invalid TOML: ${error.message}`);
    }
  }

  async writeTOML(filePath, data) {
    try {
      const tomlContent = TOML.stringify(data);
      await fs.writeFile(filePath, tomlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write TOML: ${error.message}`);
    }
  }

  validateTOML(content) {
    try {
      TOML.parse(content);
      return { valid: true, message: 'TOML is valid' };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        line: error.line,
        column: error.column
      };
    }
  }

  async validateFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return this.validateTOML(content);
    } catch (error) {
      return { valid: false, error: `Failed to read file: ${error.message}` };
    }
  }

  getValue(obj, path) {
    try {
      const keys = path.split('.');
      let current = obj;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return undefined;
        }
      }
      return current;
    } catch (error) {
      throw new Error(`Failed to get value: ${error.message}`);
    }
  }

  setValue(obj, path, value) {
    try {
      const keys = path.split('.');
      let current = obj;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
      
      current[keys[keys.length - 1]] = value;
      return obj;
    } catch (error) {
      throw new Error(`Failed to set value: ${error.message}`);
    }
  }

  deleteValue(obj, path) {
    try {
      const keys = path.split('.');
      let current = obj;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
          return obj; // Path doesn't exist
        }
        current = current[key];
      }
      
      delete current[keys[keys.length - 1]];
      return obj;
    } catch (error) {
      throw new Error(`Failed to delete value: ${error.message}`);
    }
  }

  getAllKeys(obj, prefix = '', maxDepth = 5, currentDepth = 0) {
    if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') {
      return [];
    }

    const keys = [];
    
    if (Array.isArray(obj)) {
      for (let i = 0; i < Math.min(obj.length, 10); i++) {
        const itemPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
        keys.push(itemPrefix);
        if (typeof obj[i] === 'object' && obj[i] !== null) {
          keys.push(...this.getAllKeys(obj[i], itemPrefix, maxDepth, currentDepth + 1));
        }
      }
      if (obj.length > 10) {
        keys.push(prefix ? `${prefix}[...${obj.length - 10} more items]` : `[...${obj.length - 10} more items]`);
      }
    } else {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        keys.push(fullKey);
        
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          keys.push(...this.getAllKeys(obj[key], fullKey, maxDepth, currentDepth + 1));
        }
      }
    }
    return keys;
  }

  getStructure(data, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return typeof data === 'object' && data !== null
        ? (Array.isArray(data) ? `[Array(${data.length})]` : `{Object with ${Object.keys(data).length} keys}`)
        : typeof data;
    }

    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return typeof data;

    if (Array.isArray(data)) {
      if (data.length === 0) return [];
      const sample = data.slice(0, 3).map(item => this.getStructure(item, maxDepth, currentDepth + 1));
      return data.length > 3 ? [`Array(${data.length}) - Sample:`, sample] : [`Array(${data.length}):`, sample];
    }

    const result = {};
    const keys = Object.keys(data);
    for (const key of keys.slice(0, 20)) {
      result[key] = this.getStructure(data[key], maxDepth, currentDepth + 1);
    }
    if (keys.length > 20) {
      result['...'] = `${keys.length - 20} more keys`;
    }
    return result;
  }

  searchKeyword(obj, keyword, options = {}) {
    const { searchKeys = true, searchValues = true, caseSensitive = false, regex = false, maxResults = 100 } = options;
    const results = [];

    try {
      const searchPattern = regex ? new RegExp(keyword, caseSensitive ? 'g' : 'gi') : keyword;

      const matches = (text, term) => {
        if (typeof term === 'string') {
          return caseSensitive ? text.includes(term) : text.toLowerCase().includes(term.toLowerCase());
        } else {
          return term.test(text);
        }
      };

      const search = (current, path = '') => {
        if (results.length >= maxResults) return;
        if (!current || typeof current !== 'object') return;

        if (Array.isArray(current)) {
          for (let i = 0; i < current.length; i++) {
            const itemPath = path ? `${path}[${i}]` : `[${i}]`;
            search(current[i], itemPath);
          }
        } else {
          for (const key in current) {
            const fullPath = path ? `${path}.${key}` : key;
            const value = current[key];

            // Search in section/key names
            if (searchKeys && matches(key, searchPattern)) {
              const matchType = typeof value === 'object' && value !== null ? 'section' : 'key';
              results.push({ 
                type: 'key', 
                path: fullPath, 
                key, 
                value: this.getPreview(value),
                matchType
              });
            }

            // Search in values (strings, numbers converted to string)
            if (searchValues) {
              const stringValue = String(value);
              if (matches(stringValue, searchPattern)) {
                results.push({ 
                  type: 'value', 
                  path: fullPath, 
                  key, 
                  value,
                  matchType: 'value'
                });
              }
            }

            // Recurse into nested objects (sections)
            if (typeof value === 'object' && value !== null) {
              search(value, fullPath);
            }
          }
        }
      };

      search(obj);
      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  getPreview(value) {
    if (typeof value === 'string') {
      return value.length > 100 ? value.substring(0, 100) + '...' : value;
    }
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }
    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      return `Section(${keys.length} keys)`;
    }
    return String(value);
  }
}

const tomlHandler = new TOMLHandler();

// Register TOML tools
function registerTools(server) {
  server.registerTool("toml_read", {
      name: "toml_read",
      title: "Read TOML File",
      description: "Read and parse a TOML configuration file using @iarna/toml",
      inputSchema: {
        filePath: z.string().describe("Path to the TOML file"),
      },
    },
    async ({ filePath }) => {
      try {
        const data = await tomlHandler.readTOML(filePath);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool("toml_get", {
    name: "toml_get",
    title: "Get TOML Value",
    description: "Get a configuration value from TOML using dot notation",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file"),
      path: z.string().describe("Path to the value (dot notation like 'database.host')"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await tomlHandler.readTOML(filePath);
      const value = tomlHandler.getValue(data, path);
      return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("toml_set", {
    name: "toml_set",
    title: "Set TOML Value",
    description: "Set or update a configuration value in TOML",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file"),
      path: z.string().describe("Path where to set the value (dot notation)"),
      value: z.any().describe("The value to set"),
    },
  },
  async ({ filePath, path, value }) => {
    try {
      const data = await tomlHandler.readTOML(filePath);
      tomlHandler.setValue(data, path, value);
      await tomlHandler.writeTOML(filePath, data);
      return {
        content: [{ type: "text", text: `Successfully set value at path: ${path}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("toml_delete", {
    name: "toml_delete",
    title: "Delete TOML Property",
    description: "Delete a configuration key from TOML",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file"),
      path: z.string().describe("Path to delete (dot notation)"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await tomlHandler.readTOML(filePath);
      tomlHandler.deleteValue(data, path);
      await tomlHandler.writeTOML(filePath, data);
      return {
        content: [{ type: "text", text: `Successfully deleted path: ${path}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("toml_validate", {
    name: "toml_validate",
    title: "Validate TOML File",
    description: "Validate a TOML file for syntax errors",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file to validate"),
    },
  },
  async ({ filePath }) => {
    try {
      const result = await tomlHandler.validateFile(filePath);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("toml_structure", {
    name: "toml_structure",
    title: "Analyze TOML Structure",
    description: "Get the structure of a TOML file without loading full content",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file"),
      maxDepth: z.number().optional().describe("Maximum depth to analyze (default: 3)"),
    },
  },
  async ({ filePath, maxDepth = 3 }) => {
    try {
      const data = await tomlHandler.readTOML(filePath);
      const structure = tomlHandler.getStructure(data, maxDepth);
      return {
        content: [{ type: "text", text: JSON.stringify(structure, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("toml_keys", {
    name: "toml_keys",
    title: "List TOML Keys",
    description: "List all available configuration paths in the TOML file",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file"),
      maxDepth: z.number().optional().describe("Maximum depth to traverse (default: 5)"),
    },
  },
  async ({ filePath, maxDepth = 5 }) => {
    try {
      const data = await tomlHandler.readTOML(filePath);
      const keys = tomlHandler.getAllKeys(data, '', maxDepth);
      return {
        content: [{ type: "text", text: JSON.stringify(keys, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("toml_search", {
    name: "toml_search",
    title: "Search TOML",
    description: "Search for keywords in TOML sections, keys, and values",
    inputSchema: {
      filePath: z.string().describe("Path to the TOML file"),
      keyword: z.string().describe("Keyword to search for"),
      searchKeys: z.boolean().optional().describe("Search in section and key names (default: true)"),
      searchValues: z.boolean().optional().describe("Search in values (default: true)"),
      caseSensitive: z.boolean().optional().describe("Case sensitive search (default: false)"),
      regex: z.boolean().optional().describe("Use regular expression (default: false)"),
      maxResults: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
  },
  async ({ filePath, keyword, searchKeys = true, searchValues = true, caseSensitive = false, regex = false, maxResults = 100 }) => {
    try {
      const data = await tomlHandler.readTOML(filePath);
      const results = tomlHandler.searchKeyword(data, keyword, {
        searchKeys,
        searchValues,
        caseSensitive,
        regex,
        maxResults
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ keyword, totalResults: results.length, results }, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

}

module.exports = { registerTools };