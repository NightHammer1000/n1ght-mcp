const { z } = require("zod");
const { v4: uuidv4 } = require('uuid');

// Define the application's state
const tasks = [];

// Function to register all todo-related tools on the provided server
function registerTools(server) {
  // Register tools that interact with the state
    server.registerTool("list", {
    name: "list",
    title: "List Tasks",
    description: "Lists all stored tasks",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
  })
  );

    server.registerTool("add", {
    name: "add",
    title: "Add Task",
    description: "Adds a new task to the list",
    inputSchema: {
      title: z.string(),
      description: z.string(),
      rules: z.string(),
      instructions: z.string(),
    },
  },
  async ({ title, description, rules, instructions }) => {
    const newTask = {
        id: uuidv4(),
        title,
        description,
        rules,
        instructions,
        priority: 10,
        status: 'pending',
        progress: ''
    };
    tasks.push(newTask);
    return {
      content: [{ type: "text", text: `Task added: "${title}"` }],
    };
  }
  );

  server.registerTool("remove", {
    name: "remove",
    title: "Remove Task",
    description: "Removes a task from the list",
    inputSchema: {
      id: z.string(),
    },
  },
  async ({ id }) => {
    const index = tasks.findIndex(task => task.id === id);
    if (index !== -1) {
      tasks.splice(index, 1);
      return {
        content: [{ type: "text", text: `Task removed: "${id}"` }],
      };
    }
    return {
      content: [{ type: "text", text: `Task not found: "${id}"` }],
    };
  }
  );

  server.registerTool("priority", {
    name: "priority",
    title: "Set Priority",
    description: "Sets the priority of a task",
    inputSchema: {
      id: z.string(),
      priority: z.number(),
    },
  },
  async ({ id, priority }) => {
    const task = tasks.find(task => task.id === id);
    if (task) {
      task.priority = priority;
      return {
        content: [{ type: "text", text: `Priority set for task: "${id}"` }],
      };
    }
    return {
      content: [{ type: "text", text: `Task not found: "${id}"` }],
    };
  }
  );

  server.registerTool("status", {
    name: "status",
    title: "Set Status",
    description: "Sets the status of a task",
    inputSchema: {
      id: z.string(),
      status: z.string(),
    },
  },
  async ({ id, status }) => {
    const task = tasks.find(task => task.id === id);
    if (task) {
      task.status = status;
      return {
        content: [{ type: "text", text: `Status set for task: "${id}"` }],
      };
    }
    return {
      content: [{ type: "text", text: `Task not found: "${id}"` }],
    };
  }
  );

  server.registerTool("progress", {
    name: "progress",
    title: "Set Progress",
    description: "Sets the progress of a task",
    inputSchema: {
      id: z.string(),
      progress: z.string(),
    },
  },
  async ({ id, progress }) => {
    const task = tasks.find(task => task.id === id);
    if (task) {
      task.progress = progress;
      return {
        content: [{ type: "text", text: `Progress set for task: "${id}"` }],
      };
    }
    return {
      content: [{ type: "text", text: `Task not found: "${id}"` }],
    };
  }
  );
}

module.exports = { registerTools };