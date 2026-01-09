import type { ToolWithHandler } from '~/interfaces/MCPServer.js';
import { MCPOutputAdapter } from '~/utils/MCPOutputAdapter.js';
import yaml from 'js-yaml';

const outputAdapter = new MCPOutputAdapter();

export const toolxTool: ToolWithHandler = {
  name: 'toolx',

  description: `ToolX is the PromptX tool runtime for loading and executing various tools.

## Why ToolX Exists

ToolX is your gateway to the PromptX tool ecosystem. Think of it as:
- A **universal remote control** for all PromptX tools
- Your **interface** to specialized capabilities (file operations, PDF reading, AI role creation, etc.)
- The **bridge** between you (AI agent) and powerful system tools

Without ToolX, you cannot access any PromptX ecosystem tools.

## When to Use ToolX

### Common Scenarios (IF-THEN rules):
- IF user needs file operations → USE tool://filesystem via toolx
- IF user needs to read PDF → USE tool://pdf-reader via toolx
- IF user needs to create AI role → USE tool://role-creator via toolx
- IF user needs to create new tool → USE tool://tool-creator via toolx
- IF you see tool:// in any context → USE toolx to call it

### First Time Using Any Tool
⚠️ **MUST run mode: manual first** to read the tool's documentation
⚠️ Example: toolx with mode: manual for tool://filesystem

## How to Use ToolX (Copy These Patterns)

### Pattern 1: Read Tool Manual (First Time)

**Exact code to use:**
\`\`\`javascript
// Call the mcp__promptx__toolx function with this exact structure:
mcp__promptx__toolx({
  yaml: \`tool: tool://filesystem
mode: manual\`
})
\`\`\`

**What this does:** Shows you how to use the filesystem tool

### Pattern 2: Execute Tool with Parameters

**Exact code to use:**
\`\`\`javascript
mcp__promptx__toolx({
  yaml: \`tool: tool://pdf-reader
mode: execute
parameters:
  path: /path/to/file.pdf
  action: extract\`
})
\`\`\`

**What this does:** Reads a PDF file at the specified path

### Pattern 3: Configure Tool Environment

**Exact code to use:**
\`\`\`javascript
mcp__promptx__toolx({
  yaml: \`tool: tool://my-tool
mode: configure
parameters:
  API_KEY: sk-xxx123
  TIMEOUT: 30000\`
})
\`\`\`

**What this does:** Sets environment variables for the tool

### Pattern 4: View Tool Logs

**Exact code to use:**
\`\`\`javascript
mcp__promptx__toolx({
  yaml: \`tool: tool://my-tool
mode: log
parameters:
  action: tail
  lines: 100\`
})
\`\`\`

**What this does:** Shows the last 100 log entries

## Critical Rules (Must Follow)

### ✅ Correct Format
The yaml parameter MUST be a complete YAML document:
- Start with \`tool: tool://tool-name\`
- Add \`mode: execute\` (or manual/configure/log/dryrun)
- If needed, add \`parameters:\` section with proper indentation

### ❌ Common Mistakes to Avoid
- DON'T pass just "tool://filesystem" (missing YAML structure)
- DON'T add @ prefix like "@tool://filesystem" (system handles it)
- DON'T forget "tool://" prefix (not "tool: filesystem")
- DON'T forget to read manual first for new tools

## Available System Tools

Quick reference of built-in tools:
- **tool://filesystem** - File operations (read/write/list/delete)
- **tool://pdf-reader** - Extract text and data from PDFs
- **tool://excel-tool** - Read/write/modify Excel files
- **tool://word-tool** - Read/write/modify Word documents
- **tool://role-creator** - Create AI roles (Nuwa's specialty)
- **tool://tool-creator** - Create new tools (Luban's specialty)

To see all available tools: use the discover function

## Step-by-Step Workflow

### Step 1: Discover Available Tools
Use the discover function to see what tools exist

### Step 2: Read Tool Manual
\`\`\`javascript
mcp__promptx__toolx({
  yaml: \`tool: tool://TOOLNAME
mode: manual\`
})
\`\`\`

### Step 3: Execute Tool
Copy the example from manual, modify parameters for your needs

### Step 4: Handle Errors
If execution fails, check:
- Is the tool name correct?
- Are parameters properly indented?
- Did you read the manual first?

## Architecture Context

You (AI Agent) → Client (VSCode/Cursor) → MCP Protocol → PromptX Server → ToolX → Actual Tool

ToolX is the MCP function \`mcp__promptx__toolx\` that you call with yaml parameter.

`,

  inputSchema: {
    type: 'object',
    properties: {
      yaml: {
        type: 'string',
        description: 'YAML 格式的工具调用配置'
      }
    },
    required: ['yaml']
  },

  handler: async (args: { yaml: string }) => {
    try {
      // Auto-correct common AI mistakes
      let yamlInput = args.yaml.trim();

      // Case 1: Just a plain URL string like "tool://filesystem" or "@tool://filesystem"
      if (yamlInput.match(/^@?tool:\/\/[\w-]+$/)) {
        const toolName = yamlInput.replace(/^@?tool:\/\//, '');
        yamlInput = `tool: tool://${toolName}\nmode: execute`;
      }

      // Case 2: Handle escaped backslashes and quotes: tool: \"@tool://xxx\"
      // This happens when AI generates YAML in a JSON string
      yamlInput = yamlInput.replace(/\\\\/g, '\\').replace(/\\"/g, '"');

      // Case 3: Remove @ prefix from tool URLs: @tool://xxx -> tool://xxx
      yamlInput = yamlInput.replace(/@tool:\/\//g, 'tool://');

      // Case 4: Remove quotes around tool URLs: tool: "tool://xxx" -> tool: tool://xxx
      yamlInput = yamlInput.replace(/(tool|toolUrl|url):\s*"(tool:\/\/[^"]+)"/g, '$1: $2');

      // YAML → JSON conversion
      const config = yaml.load(yamlInput) as any;

      // Normalize field names (support aliases for AI-friendliness)
      // Priority: tool > toolUrl > url
      const toolIdentifier = config.tool || config.toolUrl || config.url;

      // Priority: mode > operation
      const operationMode = config.mode || config.operation;

      // Validate required fields
      if (!toolIdentifier) {
        throw new Error('Missing required field: tool\nExample: tool: tool://filesystem\nAliases supported: tool / toolUrl / url');
      }

      // Validate URL format
      if (!toolIdentifier.startsWith('tool://')) {
        throw new Error(`Invalid tool format: ${toolIdentifier}\nMust start with tool://`);
      }

      // Convert to internal @tool:// format (compatibility with core system)
      const internalUrl = toolIdentifier.replace('tool://', '@tool://');

      // Get core module
      const core = await import('@promptx/core');
      const coreExports = core.default || core;
      const cli = (coreExports as any).cli || (coreExports as any).pouch?.cli;

      if (!cli || !cli.execute) {
        throw new Error('CLI not available in @promptx/core');
      }

      // Build CLI arguments (maintain original interface)
      const cliArgs = [internalUrl];
      cliArgs.push(operationMode || 'execute');

      if (config.parameters) {
        cliArgs.push(JSON.stringify(config.parameters));
      }

      if (config.timeout) {
        cliArgs.push('--timeout', config.timeout.toString());
      }

      // Execute
      const result = await cli.execute('toolx', cliArgs);
      return outputAdapter.convertToMCPFormat(result);

    } catch (error: any) {
      // YAML parsing errors
      if (error.name === 'YAMLException') {
        // Check for multiline string issues
        if (error.message.includes('bad indentation') || error.message.includes('mapping entry')) {
          throw new Error(`YAML format error: ${error.message}\n\nMultiline content requires | symbol, example:\ncontent: |\n  First line\n  Second line\n\nNote: Newline after |, indent content with 2 spaces`);
        }
        throw new Error(`YAML format error: ${error.message}\nCheck indentation (use spaces) and syntax`);
      }

      // Tool not found
      if (error.message?.includes('Tool not found')) {
        const toolName = args.yaml.match(/(?:tool|toolUrl|url):\s*tool:\/\/(\w+)/)?.[1];
        throw new Error(`Tool '${toolName}' not found\nUse discover to view available tools`);
      }

      throw error;
    }
  }
};