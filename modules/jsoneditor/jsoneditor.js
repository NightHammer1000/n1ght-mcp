const { z } = require("zod");
const fs = require('fs').promises;
const Ajv = require('ajv');
const { JSONPath } = require('jsonpath-plus');

// Professional JSON Handler using well-tested libraries
class JSONHandler {
  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.maxFileSize = 500 * 1024 * 1024; // 500MB limit
  }

  async readJSON(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }

  async writeJSON(filePath, data, minified = false) {
    try {
      const jsonString = minified ? JSON.stringify(data) : JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, jsonString, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write JSON: ${error.message}`);
    }
  }

  query(data, jsonPath) {
    try {
      return JSONPath({ path: jsonPath, json: data });
    } catch (error) {
      throw new Error(`JSONPath query failed: ${error.message}`);
    }
  }

  getValue(obj, path) {
    try {
      // Support both dot notation and JSONPath
      if (path.startsWith('$')) {
        const result = JSONPath({ path, json: obj });
        return result.length === 1 ? result[0] : result;
      }
      
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
      if (path.startsWith('$')) {
        // JSONPath setting is more complex, use dot notation for now
        throw new Error('Use dot notation for setting values (e.g., "user.name")');
      }

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

  appendToArray(obj, arrayPath, value) {
    try {
      const array = this.getValue(obj, arrayPath);
      if (!Array.isArray(array)) {
        throw new Error(`Path ${arrayPath} does not point to an array`);
      }
      array.push(value);
      return obj;
    } catch (error) {
      throw new Error(`Failed to append to array: ${error.message}`);
    }
  }

  validate(data, schema) {
    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(data);
      
      return {
        valid,
        errors: valid ? [] : validate.errors.map(err => ({
          path: err.instancePath,
          message: err.message,
          value: err.data
        }))
      };
    } catch (error) {
      throw new Error(`Schema validation failed: ${error.message}`);
    }
  }

  async validateFile(filePath) {
    try {
      await this.readJSON(filePath);
      return { valid: true, message: 'JSON is valid' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  minify(data) {
    return JSON.stringify(data);
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

  getSummary(data) {
    const summary = {
      type: Array.isArray(data) ? 'array' : 'object',
      size: 0,
      depth: 0,
      keys: 0
    };

    const analyze = (obj, currentDepth = 0) => {
      summary.depth = Math.max(summary.depth, currentDepth);
      
      if (Array.isArray(obj)) {
        summary.size += obj.length;
        for (const item of obj) {
          if (typeof item === 'object' && item !== null) {
            analyze(item, currentDepth + 1);
          }
        }
      } else if (typeof obj === 'object' && obj !== null) {
        const keys = Object.keys(obj);
        summary.keys += keys.length;
        summary.size += keys.length;
        
        for (const value of Object.values(obj)) {
          if (typeof value === 'object' && value !== null) {
            analyze(value, currentDepth + 1);
          }
        }
      }
    };

    analyze(data);
    return summary;
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

            // Search in keys
            if (searchKeys && matches(key, searchPattern)) {
              results.push({ type: 'key', path: fullPath, key, value: this.getPreview(value) });
            }

            // Search in values
            if (searchValues && typeof value === 'string' && matches(value, searchPattern)) {
              results.push({ type: 'value', path: fullPath, key, value });
            }

            // Recurse into objects
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
      return `Object(${keys.length} keys)`;
    }
    return String(value);
  }
}

// Function to register all JSON editor tools on the provided server
function registerTools(server) {
  const jsonHandler = new JSONHandler();

  // Register JSON tools
    server.registerTool("json_read", {
    name: "json_read",
    title: "Read JSON File",
    description: "Read and parse a JSON file",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
    },
  },
  async ({ filePath }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
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

  server.registerTool("json_query", {
    name: "json_query",
    title: "Query JSON with JSONPath",
    description: "Query JSON data using JSONPath expressions",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      jsonPath: z.string().describe("JSONPath expression (e.g., $.users[0].name or $.books[?(@.price < 10)])"),
    },
  },
  async ({ filePath, jsonPath }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const results = jsonHandler.query(data, jsonPath);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("json_get", {
    name: "json_get",
    title: "Get JSON Value",
    description: "Get a value from JSON using dot notation or JSONPath",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      path: z.string().describe("Path to the value (dot notation like 'user.name' or JSONPath like '$.user.name')"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const value = jsonHandler.getValue(data, path);
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

  server.registerTool("json_set", {
    name: "json_set",
    title: "Set JSON Value",
    description: "Set or update a value in JSON",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      path: z.string().describe("Path where to set the value (dot notation)"),
      value: z.any().describe("The value to set"),
    },
  },
  async ({ filePath, path, value }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      jsonHandler.setValue(data, path, value);
      await jsonHandler.writeJSON(filePath, data);
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

  server.registerTool("json_delete", {
    name: "json_delete",
    title: "Delete JSON Property",
    description: "Delete a property or element from JSON",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      path: z.string().describe("Path to delete (dot notation)"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      jsonHandler.deleteValue(data, path);
      await jsonHandler.writeJSON(filePath, data);
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

  server.registerTool("json_append", {
    name: "json_append",
    title: "Append to JSON Array",
    description: "Append a value to an array in JSON",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      arrayPath: z.string().describe("Path to the array (dot notation)"),
      value: z.any().describe("The value to append"),
    },
  },
  async ({ filePath, arrayPath, value }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      jsonHandler.appendToArray(data, arrayPath, value);
      await jsonHandler.writeJSON(filePath, data);
      return {
        content: [{ type: "text", text: `Successfully appended value to array at: ${arrayPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("json_validate", {
    name: "json_validate",
    title: "Validate JSON File",
    description: "Validate a JSON file for syntax errors or against a JSON Schema",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file to validate"),
      schema: z.object({}).optional().describe("JSON Schema to validate against (optional)"),
    },
  },
  async ({ filePath, schema }) => {
    try {
      if (schema) {
        const data = await jsonHandler.readJSON(filePath);
        const result = jsonHandler.validate(data, schema);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } else {
        const result = await jsonHandler.validateFile(filePath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("json_minify", {
    name: "json_minify",
    title: "Minify JSON File",
    description: "Minify a JSON file by removing whitespace and formatting",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      outputPath: z.string().optional().describe("Output path (default: overwrites original)"),
    },
  },
  async ({ filePath, outputPath }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const targetPath = outputPath || filePath;
      await jsonHandler.writeJSON(targetPath, data, true);
      return {
        content: [{ type: "text", text: `Successfully minified JSON to: ${targetPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("json_keys", {
    name: "json_keys",
    title: "List JSON Keys",
    description: "List all available keys in the JSON file",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      maxDepth: z.number().optional().describe("Maximum depth to traverse (default: 5)"),
    },
  },
  async ({ filePath, maxDepth = 5 }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const keys = jsonHandler.getAllKeys(data, '', maxDepth);
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

  server.registerTool("json_structure", {
    name: "json_structure",
    title: "Analyze JSON Structure",
    description: "Get the structure/schema of a JSON file without full content",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      maxDepth: z.number().optional().describe("Maximum depth to analyze (default: 3)"),
    },
  },
  async ({ filePath, maxDepth = 3 }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const structure = jsonHandler.getStructure(data, maxDepth);
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

  server.registerTool("json_summary", {
    name: "json_summary",
    title: "Get JSON Summary",
    description: "Get a summary of the JSON file with key statistics",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
    },
  },
  async ({ filePath }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const summary = jsonHandler.getSummary(data);
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("json_search", {
    name: "json_search",
    title: "Search JSON",
    description: "Search for keywords in JSON keys and values",
    inputSchema: {
      filePath: z.string().describe("Path to the JSON file"),
      keyword: z.string().describe("Keyword to search for"),
      searchKeys: z.boolean().optional().describe("Search in key names (default: true)"),
      searchValues: z.boolean().optional().describe("Search in values (default: true)"),
      caseSensitive: z.boolean().optional().describe("Case sensitive search (default: false)"),
      regex: z.boolean().optional().describe("Use regular expression (default: false)"),
      maxResults: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
  },
  async ({ filePath, keyword, searchKeys = true, searchValues = true, caseSensitive = false, regex = false, maxResults = 100 }) => {
    try {
      const data = await jsonHandler.readJSON(filePath);
      const results = jsonHandler.searchKeyword(data, keyword, {
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

  server.registerTool("json_create", {
    name: "json_create",
    title: "Create JSON File",
    description: "Create a new JSON file with initial data",
    inputSchema: {
      filePath: z.string().describe("Path where to create the JSON file"),
      data: z.any().describe("Initial JSON data"),
      overwrite: z.boolean().optional().describe("Overwrite if file exists (default: false)"),
    },
  },
  async ({ filePath, data, overwrite = false }) => {
    try {
      if (!overwrite) {
        try {
          await fs.access(filePath);
          return {
            content: [{ type: "text", text: `File already exists: ${filePath}. Set overwrite: true to replace.` }],
          };
        } catch (error) {
          // File doesn't exist, continue
        }
      }
      
      await jsonHandler.writeJSON(filePath, data);
      return {
        content: [{ type: "text", text: `Successfully created JSON file: ${filePath}` }],
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