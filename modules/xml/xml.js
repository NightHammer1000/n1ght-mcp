const { z } = require("zod");
const fs = require('fs').promises;
const { XMLParser, XMLBuilder, XMLValidator } = require('fast-xml-parser');

// Professional XML Handler using fast-xml-parser
class XMLHandler {
  constructor() {
    this.maxFileSize = 500 * 1024 * 1024; // 500MB limit
    
    // Parser configuration
    this.parserOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
      parseTagValue: true,
      allowBooleanAttributes: true,
      processEntities: true,
      htmlEntities: true
    };

    // Builder configuration
    this.builderOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
      indentBy: '  ',
      suppressEmptyNode: false,
      suppressBooleanAttributes: false
    };

    this.parser = new XMLParser(this.parserOptions);
    this.builder = new XMLBuilder(this.builderOptions);
  }

  async readXML(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      }

      const content = await fs.readFile(filePath, 'utf8');
      
      // Validate first
      const validation = XMLValidator.validate(content);
      if (validation !== true) {
        throw new Error(`Invalid XML: ${validation.err?.msg || 'Unknown validation error'}`);
      }

      const data = this.parser.parse(content);
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to read XML: ${error.message}`);
    }
  }

  async writeXML(filePath, data, minified = false) {
    try {
      const options = minified ? 
        { ...this.builderOptions, format: false, indentBy: '' } : 
        this.builderOptions;

      const builder = new XMLBuilder(options);
      const xmlContent = builder.build(data);

      // Validate generated XML
      const validation = XMLValidator.validate(xmlContent);
      if (validation !== true) {
        throw new Error(`Generated XML is invalid: ${validation.err?.msg || 'Unknown error'}`);
      }

      await fs.writeFile(filePath, xmlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write XML: ${error.message}`);
    }
  }

  validateXML(content) {
    try {
      const validation = XMLValidator.validate(content);
      if (validation === true) {
        return { valid: true, message: 'XML is valid' };
      } else {
        return { 
          valid: false, 
          error: validation.err?.msg || 'Unknown validation error',
          line: validation.err?.line,
          column: validation.err?.col
        };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async validateFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return this.validateXML(content);
    } catch (error) {
      return { valid: false, error: `Failed to read file: ${error.message}` };
    }
  }

  minify(data) {
    const builder = new XMLBuilder({
      ...this.builderOptions,
      format: false,
      indentBy: ''
    });
    return builder.build(data);
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
    const { searchKeys = true, searchValues = true, searchAttributes = true, caseSensitive = false, regex = false, maxResults = 100 } = options;
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

            // Search in element/attribute names
            if (searchKeys && matches(key, searchPattern)) {
              const matchType = key.startsWith('@_') ? 'attribute-name' : 'element-name';
              results.push({ 
                type: 'key', 
                path: fullPath, 
                key: key.startsWith('@_') ? key.substring(2) : key, 
                value: this.getPreview(value),
                matchType
              });
            }

            // Search in text content and attribute values
            if (searchValues && typeof value === 'string' && matches(value, searchPattern)) {
              const matchType = key.startsWith('@_') ? 'attribute-value' : 
                              key === '#text' ? 'text-content' : 'value';
              results.push({ 
                type: 'value', 
                path: fullPath, 
                key: key.startsWith('@_') ? key.substring(2) : key, 
                value,
                matchType
              });
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

// Function to register all XML tools on the provided server
function registerTools(server) {
  const xmlHandler = new XMLHandler();

  // Register XML tools
    server.registerTool("xml_read", {
    name: "xml_read",
    title: "Read XML File",
    description: "Read and parse an XML file using fast-xml-parser",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
    },
  },
  async ({ filePath }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
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

  server.registerTool("xml_get", {
    name: "xml_get",
    title: "Get XML Value",
    description: "Get a value from XML using dot notation path",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
      path: z.string().describe("Path to the value (dot notation like 'root.book.title')"),
    },
  },
  async ({ filePath, path }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
      const value = xmlHandler.getValue(data, path);
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

  server.registerTool("xml_set", {
    name: "xml_set",
    title: "Set XML Value",
    description: "Set or update a value in XML structure",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
      path: z.string().describe("Path where to set the value (dot notation)"),
      value: z.any().describe("The value to set"),
    },
  },
  async ({ filePath, path, value }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
      xmlHandler.setValue(data, path, value);
      await xmlHandler.writeXML(filePath, data);
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

  server.registerTool("xml_validate", {
    name: "xml_validate",
    title: "Validate XML File",
    description: "Validate an XML file for syntax errors and well-formedness",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file to validate"),
    },
  },
  async ({ filePath }) => {
    try {
      const result = await xmlHandler.validateFile(filePath);
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

  server.registerTool("xml_minify", {
    name: "xml_minify",
    title: "Minify XML File",
    description: "Minify an XML file by removing whitespace and formatting",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
      outputPath: z.string().optional().describe("Output path (default: overwrites original)"),
    },
  },
  async ({ filePath, outputPath }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
      const targetPath = outputPath || filePath;
      await xmlHandler.writeXML(targetPath, data, true);
      return {
        content: [{ type: "text", text: `Successfully minified XML to: ${targetPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

  server.registerTool("xml_structure", {
    name: "xml_structure",
    title: "Analyze XML Structure",
    description: "Get the structure of an XML file without loading full content",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
      maxDepth: z.number().optional().describe("Maximum depth to analyze (default: 3)"),
    },
  },
  async ({ filePath, maxDepth = 3 }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
      const structure = xmlHandler.getStructure(data, maxDepth);
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

  server.registerTool("xml_keys", {
    name: "xml_keys",
    title: "List XML Keys",
    description: "List all available element paths in the XML file",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
      maxDepth: z.number().optional().describe("Maximum depth to traverse (default: 5)"),
    },
  },
  async ({ filePath, maxDepth = 5 }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
      const keys = xmlHandler.getAllKeys(data, '', maxDepth);
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

  server.registerTool("xml_search", {
    name: "xml_search",
    title: "Search XML",
    description: "Search for keywords in XML elements, attributes, and text content",
    inputSchema: {
      filePath: z.string().describe("Path to the XML file"),
      keyword: z.string().describe("Keyword to search for"),
      searchKeys: z.boolean().optional().describe("Search in element names (default: true)"),
      searchValues: z.boolean().optional().describe("Search in text content (default: true)"),
      searchAttributes: z.boolean().optional().describe("Search in attributes (default: true)"),
      caseSensitive: z.boolean().optional().describe("Case sensitive search (default: false)"),
      regex: z.boolean().optional().describe("Use regular expression (default: false)"),
      maxResults: z.number().optional().describe("Maximum number of results (default: 100)"),
    },
  },
  async ({ filePath, keyword, searchKeys = true, searchValues = true, searchAttributes = true, caseSensitive = false, regex = false, maxResults = 100 }) => {
    try {
      const data = await xmlHandler.readXML(filePath);
      const results = xmlHandler.searchKeyword(data, keyword, {
        searchKeys,
        searchValues,
        searchAttributes,
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