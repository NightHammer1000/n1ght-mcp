const { z } = require("zod");

// Sequential Thinking Handler for complex problem-solving
class SequentialThinking {
  constructor() {
    this.sessions = new Map(); // Store thinking sessions by ID
    this.sessionCounter = 0;
    this.enableLogging = process.env.THINKING_LOG === 'true' || false;
  }

  createSession(sessionId = null) {
    const id = sessionId || `session_${++this.sessionCounter}`;
    const session = {
      id,
      thoughts: [],
      currentThought: 0,
      totalThoughts: 10, // Default, can be adjusted
      startTime: new Date(),
      branches: [], // Track alternative thinking paths
      revisions: [] // Track thought revisions
    };
    
    this.sessions.set(id, session);
    this.log(`Created thinking session: ${id}`, 'info');
    return session;
  }

  addThought(sessionId, thoughtData) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const thought = {
      id: session.thoughts.length + 1,
      content: thoughtData.content,
      type: thoughtData.type || 'analysis',
      timestamp: new Date(),
      confidence: thoughtData.confidence || null,
      tags: thoughtData.tags || [],
      parentThought: thoughtData.parentThought || null,
      isRevision: thoughtData.isRevision || false
    };

    session.thoughts.push(thought);
    session.currentThought = session.thoughts.length;
    
    this.log(`Thought ${thought.id}: ${thought.content.substring(0, 100)}...`, 'thought');
    
    return thought;
  }

  revisethought(sessionId, thoughtId, newContent, reason = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const originalThought = session.thoughts.find(t => t.id === thoughtId);
    if (!originalThought) {
      throw new Error(`Thought ${thoughtId} not found`);
    }

    const revision = {
      originalThoughtId: thoughtId,
      originalContent: originalThought.content,
      newContent,
      reason,
      timestamp: new Date()
    };

    session.revisions.push(revision);
    originalThought.content = newContent;
    originalThought.isRevised = true;
    originalThought.revisionReason = reason;

    this.log(`Revised thought ${thoughtId}: ${reason || 'No reason provided'}`, 'revision');
    
    return revision;
  }

  branchThinking(sessionId, fromThoughtId, branchName, initialThought) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const branch = {
      id: `${sessionId}_branch_${session.branches.length + 1}`,
      name: branchName,
      fromThoughtId,
      thoughts: [],
      timestamp: new Date()
    };

    if (initialThought) {
      branch.thoughts.push({
        id: 1,
        content: initialThought,
        type: 'branch_start',
        timestamp: new Date(),
        parentThought: fromThoughtId
      });
    }

    session.branches.push(branch);
    this.log(`Created branch '${branchName}' from thought ${fromThoughtId}`, 'branch');
    
    return branch;
  }

  adjustTotalThoughts(sessionId, newTotal, reason = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const oldTotal = session.totalThoughts;
    session.totalThoughts = Math.max(1, newTotal);
    
    this.log(`Adjusted total thoughts from ${oldTotal} to ${session.totalThoughts}${reason ? ': ' + reason : ''}`, 'adjustment');
    
    return { oldTotal, newTotal: session.totalThoughts, reason };
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  getProgress(sessionId) {
    const session = this.getSession(sessionId);
    return {
      sessionId: session.id,
      currentThought: session.currentThought,
      totalThoughts: session.totalThoughts,
      progress: `${session.currentThought}/${session.totalThoughts}`,
      percentComplete: Math.round((session.currentThought / session.totalThoughts) * 100),
      thoughtsRemaining: Math.max(0, session.totalThoughts - session.currentThought),
      branches: session.branches.length,
      revisions: session.revisions.length,
      duration: new Date() - session.startTime
    };
  }

  getSummary(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      session: {
        id: session.id,
        startTime: session.startTime,
        duration: new Date() - session.startTime,
        totalThoughts: session.totalThoughts,
        currentThought: session.currentThought
      },
      thoughts: session.thoughts.map(t => ({
        id: t.id,
        type: t.type,
        content: t.content.substring(0, 200) + (t.content.length > 200 ? '...' : ''),
        confidence: t.confidence,
        tags: t.tags,
        isRevised: t.isRevised || false,
        timestamp: t.timestamp
      })),
      branches: session.branches.map(b => ({
        id: b.id,
        name: b.name,
        fromThoughtId: b.fromThoughtId,
        thoughtCount: b.thoughts.length,
        timestamp: b.timestamp
      })),
      revisions: session.revisions.map(r => ({
        thoughtId: r.originalThoughtId,
        reason: r.reason,
        timestamp: r.timestamp
      })),
      progress: this.getProgress(sessionId)
    };
  }

  listSessions() {
    return Array.from(this.sessions.keys()).map(sessionId => ({
      id: sessionId,
      ...this.getProgress(sessionId)
    }));
  }

  deleteSession(sessionId) {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.log(`Deleted session: ${sessionId}`, 'info');
    }
    return existed;
  }

  log(message, type = 'info') {
    if (!this.enableLogging) return;
    
    const colors = {
      info: '\x1b[36m',      // Cyan
      thought: '\x1b[32m',   // Green
      revision: '\x1b[33m',  // Yellow
      branch: '\x1b[35m',    // Magenta
      adjustment: '\x1b[34m', // Blue
      error: '\x1b[31m'      // Red
    };
    
    const color = colors[type] || colors.info;
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] [${type.toUpperCase()}] ${message}\x1b[0m`);
  }
}

const thinkingHandler = new SequentialThinking();

// Register the main sequential thinking tool
function registerTools(server) {
  server.registerTool("sequentialthinking", {
  name: "sequentialthinking",
  title: "Sequential Thinking",
  description: "Process complex problems through structured, sequential thinking with support for revisions, branches, and dynamic adjustment",
  inputSchema: {
    sessionId: z.string().optional().describe("Session ID (auto-generated if not provided)"),
    thought: z.string().describe("The current thought or analysis"),
    type: z.enum(["analysis", "hypothesis", "question", "conclusion", "reflection", "branch_start"]).optional().describe("Type of thought"),
    confidence: z.number().min(0).max(100).optional().describe("Confidence level (0-100)"),
    tags: z.array(z.string()).optional().describe("Tags for categorizing the thought"),
    action: z.enum(["think", "revise", "branch", "adjust_total", "summary"]).optional().describe("Action to perform (default: think)"),
    targetThoughtId: z.number().optional().describe("For revisions or branching, the thought ID to target"),
    newTotal: z.number().optional().describe("For adjust_total action, the new total number of thoughts"),
    reason: z.string().optional().describe("Reason for revision or adjustment"),
    branchName: z.string().optional().describe("Name for new thinking branch")
  },
},
async ({ sessionId, thought, type, confidence, tags, action = "think", targetThoughtId, newTotal, reason, branchName }) => {
  try {
    // Create session if it doesn't exist
    let session;
    if (sessionId && thinkingHandler.sessions.has(sessionId)) {
      session = thinkingHandler.getSession(sessionId);
    } else {
      session = thinkingHandler.createSession(sessionId);
    }

    let result;

    switch (action) {
      case "think":
        const newThought = thinkingHandler.addThought(session.id, {
          content: thought,
          type,
          confidence,
          tags
        });
        result = {
          action: "thought_added",
          thought: newThought,
          progress: thinkingHandler.getProgress(session.id)
        };
        break;

      case "revise":
        if (!targetThoughtId) {
          throw new Error("targetThoughtId required for revision");
        }
        const revision = thinkingHandler.revisethought(session.id, targetThoughtId, thought, reason);
        result = {
          action: "thought_revised",
          revision,
          progress: thinkingHandler.getProgress(session.id)
        };
        break;

      case "branch":
        if (!targetThoughtId) {
          throw new Error("targetThoughtId required for branching");
        }
        if (!branchName) {
          throw new Error("branchName required for branching");
        }
        const branch = thinkingHandler.branchThinking(session.id, targetThoughtId, branchName, thought);
        result = {
          action: "branch_created",
          branch,
          progress: thinkingHandler.getProgress(session.id)
        };
        break;

      case "adjust_total":
        if (!newTotal) {
          throw new Error("newTotal required for adjustment");
        }
        const adjustment = thinkingHandler.adjustTotalThoughts(session.id, newTotal, reason);
        result = {
          action: "total_adjusted",
          adjustment,
          progress: thinkingHandler.getProgress(session.id)
        };
        break;

      case "summary":
        result = {
          action: "summary_generated",
          summary: thinkingHandler.getSummary(session.id)
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

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

// Additional helper tools
  server.registerTool("thinking_sessions", {
  name: "thinking_sessions",
  title: "List Thinking Sessions",
  description: "List all active thinking sessions with their progress",
  inputSchema: {},
},
async () => {
  try {
    const sessions = thinkingHandler.listSessions();
    return {
      content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
}
);

  server.registerTool("thinking_delete", {
  name: "thinking_delete",
  title: "Delete Thinking Session",
  description: "Delete a thinking session and all its data",
  inputSchema: {
    sessionId: z.string().describe("Session ID to delete"),
  },
},
async ({ sessionId }) => {
  try {
    const deleted = thinkingHandler.deleteSession(sessionId);
    return {
      content: [{ type: "text", text: JSON.stringify({ deleted, sessionId }, null, 2) }],
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