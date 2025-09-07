const { z } = require("zod");
const fs = require('fs').promises;
const yaml = require('js-yaml');

// Professional YAML Handler using js-yaml
class YAMLHandler {
  constructor() {
    this.maxFileSize = 500 * 1024 * 1024; // 500MB limit
    
    // Load options
    this.loadOptions = {
      filename: null,
      onWarning: null,
      schema: yaml.DEFAULT_SCHEMA,
      json: false,
      listener: null
    };

    // Dump options  
    this.dumpOptions = {
      indent: 2,
      noArrayIndent: false,
      skipInvalid: false,
      flowLevel: -1,
      styles: {},
      schema: yaml.DEFAULT_SCHEMA,
      sortKeys: false,
      lineWidth: 80,
      noRefs: false,
      noCompatMode: false,
      condenseFlow: false,
      quotingType: '"',
      forceQuotes: false
    };
  }

  async readYAML(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      
      // Try to load all documents first (multi-document support)
      try {
        const documents = yaml.loadAll(content, null, this.loadOptions);
        // If single document, return it directly
        if (documents.length === 1) {
          return documents[0];
        }
        // Multiple documents - return array
        return documents;
      } catch (multiError) {
        // Fallback to single document
        const data = yaml.load(content, this.loadOptions);
        return data;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Invalid YAML: ${error.message}`);
    }
  }

  async writeYAML(filePath, data, options = {}) {
    try {
      const yamlOptions = { ...this.dumpOptions, ...options };
      const yamlContent = yaml.dump(data, yamlOptions);
      await fs.writeFile(filePath, yamlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write YAML: ${error.message}`);
    }
  }

  validateYAML(content) {
    try {
      yaml.load(content, this.loadOptions);
      return { valid: true, message: 'YAML is valid' };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        line: error.mark?.line,
        column: error.mark?.column
      };
    }
  }

  async validateFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return this.validateYAML(content);
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

            // Search in keys
            if (searchKeys && matches(key, searchPattern)) {
              results.push({ 
                type: 'key', 
                path: fullPath, 
                key, 
                value: this.getPreview(value),
                matchType: 'key'
              });
            }

            // Search in values (supports strings, numbers, booleans converted to string)
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

            // Recurse into nested objects
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

const yamlHandler = new YAMLHandler();

// Register YAML tools
function registerTools(server) {
  server.registerTool("yaml_read", {
    name: "yaml_read",
    title: "Read YAML File",
    description: "Read and parse a YAML file with multi-document support using js-yaml",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
    },
  },
  async ({ filePath }) => {
    try {
      const data = await yamlHandler.readYAML(filePath);
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

  server.registerTool("yaml_get", {
    name: "yaml_get",
    title: "Get YAML Value",
    description: "Get a value from YAML using dot notation",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
      path: z.string().describe("Path to the value (dot notation like 'database.host')"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await yamlHandler.readYAML(filePath);
      const value = yamlHandler.getValue(data, path);
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

  server.registerTool("yaml_set", {
    name: "yaml_set",
    title: "Set YAML Value",
    description: "Set or update a value in YAML files",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
      path: z.string().describe("Path where to set the value (dot notation)"),
      value: z.any().describe("The value to set"),
    },
  },
  async ({ filePath, path, value }) => {
    try {
      const data = await yamlHandler.readYAML(filePath);
      yamlHandler.setValue(data, path, value);
      await yamlHandler.writeYAML(filePath, data);
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

  server.registerTool("yaml_delete", {
    name: "yaml_delete",
    title: "Delete YAML Property",
    description: "Delete a property from YAML",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
      path: z.string().describe("Path to delete (dot notation)"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await yamlHandler.readYAML(filePath);
      yamlHandler.deleteValue(data, path);
      await yamlHandler.writeYAML(filePath, data);
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

  server.registerTool("yaml_validate", {
    name: "yaml_validate",
    title: "Validate YAML File",
    description: "Validate a YAML file for syntax errors",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file to validate"),
    },
  },
  async ({ filePath }) => {
    try {
      const result = await yamlHandler.validateFile(filePath);
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

  server.registerTool("yaml_structure", {
    name: "yaml_structure",
    title: "Analyze YAML Structure",
    description: "Get the structure of a YAML file without loading full content",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
      maxDepth: z.number().optional().describe("Maximum depth to analyze (default: 3)"),
    },
  },
  async ({ filePath, maxDepth = 3 }) => {
    try {
      const data = await yamlHandler.readYAML(filePath);
      const structure = yamlHandler.getStructure(data, maxDepth);
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

  server.registerTool("yaml_keys", {
    name: "yaml_keys",
    title: "List YAML Keys",
    description: "List all available keys in the YAML file (including array indices)",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
      maxDepth: z.number().optional().describe("Maximum depth to traverse (default: 5)"),
    },
  },
  async ({ filePath, maxDepth = 5 }) => {
    try {
      const data = await yamlHandler.readYAML(filePath);
      const keys = yamlHandler.getAllKeys(data, '', maxDepth);
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

  server.registerTool("yaml_search", {
    name: "yaml_search",
    title: "Search YAML",
    description: "Search for keywords in YAML keys and values with regex support",
    inputSchema: {
      filePath: z.string().describe("Path to the YAML file"),
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
      const data = await yamlHandler.readYAML(filePath);
      const results = yamlHandler.searchKeyword(data, keyword, {
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