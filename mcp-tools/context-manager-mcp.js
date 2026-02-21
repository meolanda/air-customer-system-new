#!/usr/bin/env node
/**
 * 🧹 Context Manager MCP Server
 * MCP Server สำหรับจัดการ context บวม
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const contextManager = require('./context-manager.js');

// ==================== MCP SERVER ====================

class ContextManagerServer {
  constructor() {
    this.server = new Server(
      {
        name: 'context-manager-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'analyze_context',
            description: 'วิเคราะห์ขนาดและปัญหาของ context ปัจจุบัน',
            inputSchema: {
              type: 'object',
              properties: {
                contextPath: {
                  type: 'string',
                  description: 'Path ไปยังไฟล์ context หรือ directory',
                },
              },
              required: ['contextPath'],
            },
          },
          {
            name: 'clean_context',
            description: 'ล้าง context ให้กระชับ (ลบ system reminders ซ้ำๆ)',
            inputSchema: {
              type: 'object',
              properties: {
                contextPath: {
                  type: 'string',
                  description: 'Path ไปยังไฟล์ context',
                },
                options: {
                  type: 'object',
                  properties: {
                    keepLatest: {
                      type: 'boolean',
                      description: 'เก็บเฉพาะ system reminder ล่าสุด (default: true)',
                    },
                    removeAll: {
                      type: 'boolean',
                      description: 'ลบ system reminders ทั้งหมด (default: false)',
                    },
                    summarize: {
                      type: 'boolean',
                      description: 'สรุป context ถ้าใหญ่เกินไป (default: true)',
                    },
                    outputPath: {
                      type: 'string',
                      description: 'Path สำหรับบันทึกไฟล์ที่ล้างแล้ว',
                    },
                  },
                },
              },
              required: ['contextPath'],
            },
          },
          {
            name: 'optimize_context',
            description: 'ปรับปรุง context อัตโนมัติ (analyze + clean ในคำสั่งเดียว)',
            inputSchema: {
              type: 'object',
              properties: {
                contextPath: {
                  type: 'string',
                  description: 'Path ไปยังไฟล์ context',
                },
                outputPath: {
                  type: 'string',
                  description: 'Path สำหรับบันทึกไฟล์ที่ปรับปรุงแล้ว',
                },
              },
              required: ['contextPath'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_context':
            return await this.handleAnalyzeContext(args);

          case 'clean_context':
            return await this.handleCleanContext(args);

          case 'optimize_context':
            return await this.handleOptimizeContext(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
              }),
            },
          ],
        };
      }
    });
  }

  async handleAnalyzeContext(args) {
    const result = await contextManager.analyzeContextTool(args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async handleCleanContext(args) {
    const result = await contextManager.cleanContextTool(args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async handleOptimizeContext(args) {
    const result = await contextManager.optimizeContextTool(args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Context Manager MCP Server running on stdio');
  }
}

// ==================== MAIN ====================

if (require.main === module) {
  const server = new ContextManagerServer();
  server.run().catch(console.error);
}

module.exports = { ContextManagerServer };
