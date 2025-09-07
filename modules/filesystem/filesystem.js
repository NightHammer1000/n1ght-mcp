const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const { SentencePieceTokenizer } = require("@agnai/sentencepiece-js");
const { Tokenizer } = require("@accessprotocol/tokenizers");

// Filesystem Handler with size limits and rejection instead of truncation
class FilesystemHandler {
  constructor() {
    this.configPath = path.join(process.cwd(), ".n1ght.json");
    this.config = null;
    this.enableLogging = process.env.FILESYSTEM_LOG === 'true' || false;
    this.gemmaTokenizer = null;
    this.claudeTokenizer = null;
    this.loadConfig();
    this.initTokenizers();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf8");
        this.config = JSON.parse(configData);
        this.log(`Loaded filesystem configuration from ${this.configPath}`, 'info');
      } else {
        this.log("Configuration file .n1ght.json not found, using defaults", 'warning');
        this.config = {};
      }
    } catch (error) {
      this.log(`Error loading config: ${error.message}`, 'error');
      this.config = {};
    }
  }

  async initTokenizers() {
    // Initialize Gemma tokenizer
    try {
      const possibleGemmaPaths = [
        path.join(__dirname, 'gemma.model'),
        path.join(process.cwd(), 'gemma.model'),
        path.join(process.cwd(), 'tokenizers', 'gemma.model')
      ];

      let gemmaPath = null;
      for (const modelPath of possibleGemmaPaths) {
        if (fs.existsSync(modelPath)) {
          gemmaPath = modelPath;
          break;
        }
      }

      if (gemmaPath) {
        this.gemmaTokenizer = new SentencePieceTokenizer(gemmaPath);
        this.log(`Initialized Gemma tokenizer from: ${gemmaPath}`, 'info');
      } else {
        this.log("Gemma tokenizer model not found. Gemini token counting will use estimation.", 'warning');
      }
    } catch (error) {
      this.log(`Failed to initialize Gemma tokenizer: ${error.message}`, 'warning');
      this.gemmaTokenizer = null;
    }

    // Initialize Claude tokenizer
    try {
      const possibleClaudePaths = [
        path.join(__dirname, 'claude.json'),
        path.join(process.cwd(), 'claude.json'),
        path.join(process.cwd(), 'tokenizers', 'claude.json')
      ];

      let claudePath = null;
      for (const modelPath of possibleClaudePaths) {
        if (fs.existsSync(modelPath)) {
          claudePath = modelPath;
          break;
        }
      }

      if (claudePath) {
        const claudeConfig = fs.readFileSync(claudePath, 'utf8');
        this.claudeTokenizer = await Tokenizer.fromString(claudeConfig);
        this.log(`Initialized Claude tokenizer from: ${claudePath}`, 'info');
      } else {
        this.log("Claude tokenizer model not found. Claude token counting will use estimation.", 'warning');
      }
    } catch (error) {
      this.log(`Failed to initialize Claude tokenizer: ${error.message}`, 'warning');
      this.claudeTokenizer = null;
    }

    if (!this.gemmaTokenizer && !this.claudeTokenizer) {
      this.log("Tokenizer files not found. To enable accurate token counting:", 'info');
      this.log("Run these commands in your project directory:", 'info');
      this.log('mkdir -p tokenizers', 'info');
      this.log('curl -o tokenizers/claude.json "https://raw.githubusercontent.com/SillyTavern/SillyTavern/refs/heads/release/src/tokenizers/claude.json"', 'info');
      this.log('curl -o tokenizers/gemma.model "https://raw.githubusercontent.com/SillyTavern/SillyTavern/refs/heads/release/src/tokenizers/gemma.model"', 'info');
    }
  }

  getMaxInputTokens(userSpecified = null) {
    // Priority: user specified > config file > no default (must be configured)
    if (userSpecified && userSpecified > 0) {
      return userSpecified;
    }
    
    if (this.config.filesystem && this.config.filesystem.maxInputTokens) {
      return this.config.filesystem.maxInputTokens;
    }
    
    throw new Error(
      "No token limit configured. Please set maxInputTokens in .n1ght.json filesystem section " +
      "or provide maxTokens parameter. Recommended values: Claude Sonnet ~200K, Gemini 2.5 ~2M tokens."
    );
  }

  getMaxInputSize(userSpecified = null) {
    // Priority: user specified > config file > no default (must be configured)
    if (userSpecified && userSpecified > 0) {
      return userSpecified;
    }
    
    if (this.config.filesystem && this.config.filesystem.maxInputSize) {
      return this.config.filesystem.maxInputSize;
    }
    
    throw new Error(
      "No size limit configured. Please set maxInputSize in .n1ght.json filesystem section " +
      "or provide maxSize parameter for binary files."
    );
  }

  // Count tokens using appropriate tokenizer or fallback to estimation
  countTokens(text, model = 'auto') {
    if (!text || typeof text !== 'string') return 0;
    
    // Auto-detect or use specified model
    let useTokenizer = null;
    if (model === 'claude' && this.claudeTokenizer) {
      useTokenizer = 'claude';
    } else if (model === 'gemini' && this.gemmaTokenizer) {
      useTokenizer = 'gemma';
    } else if (model === 'auto') {
      // Prefer Gemma if available (covers Gemini), fallback to Claude
      if (this.gemmaTokenizer) useTokenizer = 'gemma';
      else if (this.claudeTokenizer) useTokenizer = 'claude';
    }
    
    try {
      if (useTokenizer === 'gemma' && this.gemmaTokenizer) {
        const tokens = this.gemmaTokenizer.encodeIds(text);
        return tokens.length;
      } else if (useTokenizer === 'claude' && this.claudeTokenizer) {
        const encoded = this.claudeTokenizer.encode(text);
        return encoded.getIds().length;
      }
    } catch (error) {
      this.log(`${useTokenizer} tokenizer failed, using estimation: ${error.message}`, 'warning');
    }
    
    // Fallback estimation (same as SillyTavern: 3.35 chars per token)
    return Math.ceil(text.length / 3.35);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async readSingleFile(filePath, maxTokens) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    this.log(`Reading file: ${filePath} (${this.formatBytes(stats.size)})`, 'info');

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const tokenCount = this.countTokens(content);
      
      if (tokenCount > maxTokens) {
        throw new Error(
          `File too large: ${tokenCount} tokens exceeds limit of ${maxTokens} tokens. ` +
          `File size: ${this.formatBytes(stats.size)}. ` +
          `Please be more specific about which part of the file you need, or increase the maxTokens parameter.`
        );
      }

      return {
        path: filePath,
        size: stats.size,
        tokenCount,
        content,
        encoding: 'utf8',
        lastModified: stats.mtime,
        success: true
      };
    } catch (error) {
      if (error.code === 'EISDIR') {
        throw new Error(`Path is a directory, not a file: ${filePath}`);
      } else if (error.message.includes('invalid UTF-8')) {
        // Try reading as binary if UTF-8 fails
        const buffer = fs.readFileSync(filePath);
        return {
          path: filePath,
          size: stats.size,
          tokenCount: 0, // Binary files don't have meaningful token counts
          content: buffer.toString('base64'),
          encoding: 'base64',
          lastModified: stats.mtime,
          success: true,
          note: 'File appears to be binary, encoded as base64'
        };
      }
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async readMultipleFiles(filePaths, maxTotalSize) {
    const results = [];
    let totalSize = 0;
    let processedSize = 0;

    // First pass: check all file sizes
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        results.push({
          path: filePath,
          success: false,
          error: `File not found: ${filePath}`
        });
        continue;
      }

      const stats = fs.statSync(filePath);
      
      if (!stats.isFile()) {
        results.push({
          path: filePath,
          success: false,
          error: `Path is not a file: ${filePath}`
        });
        continue;
      }

      totalSize += stats.size;
    }

    if (totalSize > maxTotalSize) {
      throw new Error(
        `Total file size too large: ${this.formatBytes(totalSize)} exceeds limit of ${this.formatBytes(maxTotalSize)}. ` +
        `Please be more specific about which files you need, or increase the maxTotalSize parameter.`
      );
    }

    // Second pass: read files
    for (const filePath of filePaths) {
      if (results.find(r => r.path === filePath && !r.success)) {
        continue; // Skip files that already failed
      }

      try {
        const result = await this.readSingleFile(filePath, maxTotalSize);
        results.push(result);
        processedSize += result.size;
      } catch (error) {
        results.push({
          path: filePath,
          success: false,
          error: error.message
        });
      }
    }

    return {
      files: results,
      totalFiles: filePaths.length,
      successfulFiles: results.filter(r => r.success).length,
      totalSize: processedSize,
      formattedTotalSize: this.formatBytes(processedSize)
    };
  }

  async readDirectory(dirPath, maxTotalSize, options = {}) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    const {
      recursive = false,
      includeHidden = false,
      fileExtensions = null, // array of extensions like ['.js', '.ts', '.md']
      excludePatterns = [/node_modules/, /\.git/, /\.DS_Store/]
    } = options;

    const allFiles = [];
    
    const scanDirectory = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(dirPath, fullPath);
        
        // Skip hidden files if not included
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        // Check exclude patterns
        if (excludePatterns.some(pattern => pattern.test(relativePath) || pattern.test(entry.name))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          if (recursive) {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          // Check file extension filter
          if (fileExtensions && fileExtensions.length > 0) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!fileExtensions.includes(ext)) {
              continue;
            }
          }
          
          allFiles.push(fullPath);
        }
      }
    };

    scanDirectory(dirPath);
    
    this.log(`Found ${allFiles.length} files in directory: ${dirPath}`, 'info');
    
    if (allFiles.length === 0) {
      return {
        directory: dirPath,
        files: [],
        totalFiles: 0,
        successfulFiles: 0,
        totalSize: 0,
        formattedTotalSize: '0 Bytes'
      };
    }

    // Read all found files
    const result = await this.readMultipleFiles(allFiles, maxTotalSize);
    
    return {
      directory: dirPath,
      ...result,
      options: {
        recursive,
        includeHidden,
        fileExtensions,
        excludePatterns: excludePatterns.map(p => p.toString())
      }
    };
  }

  log(message, type = 'info') {
    if (!this.enableLogging) return;
    
    const colors = {
      info: '\x1b[36m',      // Cyan
      warning: '\x1b[33m',   // Yellow
      error: '\x1b[31m',     // Red
      success: '\x1b[92m'    // Bright Green
    };
    
    const color = colors[type] || colors.info;
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] [FILESYSTEM-${type.toUpperCase()}] ${message}\x1b[0m`);
  }
}

const fsHandler = new FilesystemHandler();

// Register file reading tool
function registerTools(server) {
  server.registerTool("fs_read_file", {
  name: "fs_read_file",
  title: "Read Single File",
  description: "Read a single file with size limits. Rejects if file exceeds limit instead of truncating.",
  inputSchema: {
    filePath: z.string().describe("Path to the file to read"),
    maxSize: z.number().positive().optional().describe("Maximum file size in bytes (overrides config default)")
  },
},
async ({ filePath, maxSize }) => {
  try {
    const actualMaxSize = fsHandler.getMaxInputSize(maxSize);
    const result = await fsHandler.readSingleFile(filePath, actualMaxSize);
    
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: true,
        file: result,
        maxSizeUsed: fsHandler.formatBytes(actualMaxSize)
      }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: false,
        error: error.message,
        filePath
      }, null, 2) }],
    };
  }
}
);

// Register multiple files reading tool
  server.registerTool("fs_read_files", {
  name: "fs_read_files",
  title: "Read Multiple Files",
  description: "Read multiple files at once with total size limits. Rejects if total size exceeds limit.",
  inputSchema: {
    filePaths: z.array(z.string()).describe("Array of file paths to read"),
    maxTotalSize: z.number().positive().optional().describe("Maximum total size in bytes for all files combined")
  },
},
async ({ filePaths, maxTotalSize }) => {
  try {
    const actualMaxSize = fsHandler.getMaxInputSize(maxTotalSize);
    const result = await fsHandler.readMultipleFiles(filePaths, actualMaxSize);
    
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: true,
        ...result,
        maxSizeUsed: fsHandler.formatBytes(actualMaxSize)
      }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: false,
        error: error.message,
        filePaths
      }, null, 2) }],
    };
  }
}
);

// Register directory reading tool
  server.registerTool("fs_read_directory", {
  name: "fs_read_directory",
  title: "Read Directory Contents",
  description: "Read all files in a directory with filtering options and size limits. Rejects if total size exceeds limit.",
  inputSchema: {
    dirPath: z.string().describe("Path to the directory to read"),
    maxTotalSize: z.number().positive().optional().describe("Maximum total size in bytes for all files"),
    recursive: z.boolean().optional().describe("Read subdirectories recursively (default: false)"),
    includeHidden: z.boolean().optional().describe("Include hidden files (default: false)"),
    fileExtensions: z.array(z.string()).optional().describe("Filter by file extensions (e.g., ['.js', '.ts', '.md'])"),
    excludePatterns: z.array(z.string()).optional().describe("Exclude patterns (regex strings)")
  },
},
async ({ dirPath, maxTotalSize, recursive = false, includeHidden = false, fileExtensions, excludePatterns }) => {
  try {
    const actualMaxSize = fsHandler.getMaxInputSize(maxTotalSize);
    
    const options = {
      recursive,
      includeHidden,
      fileExtensions,
      excludePatterns: excludePatterns ? excludePatterns.map(p => new RegExp(p)) : [/node_modules/, /\.git/, /\.DS_Store/]
    };
    
    const result = await fsHandler.readDirectory(dirPath, actualMaxSize, options);
    
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: true,
        ...result,
        maxSizeUsed: fsHandler.formatBytes(actualMaxSize)
      }, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        success: false,
        error: error.message,
        dirPath
      }, null, 2) }],
    };
  }
}
);

}

module.exports = { registerTools };