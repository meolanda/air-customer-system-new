#!/usr/bin/env node
/**
 * 🧹 Context Manager MCP Tool
 * แก้ปัญหา Context บวมด้วยการจัดการ context อย่างมีประสิทธิภาพ
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const CONFIG = {
  MAX_CONTEXT_SIZE: 50000, // ตัวอักษร
  SYSTEM_REMINDER_REGEX: /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  DUPLICATE_WARNING_THRESHOLD: 3, // จำนวนครั้งที่จะถือว่าซ้ำ
};

// ==================== CONTEXT ANALYSIS ====================

/**
 * วิเคราะห์ขนาดและเนื้อหาของ context
 */
function analyzeContext(contextText) {
  const lines = contextText.split('\n');
  const systemReminders = contextText.match(CONFIG.SYSTEM_REMINDER_REGEX) || [];

  return {
    totalSize: contextText.length,
    totalLines: lines.length,
    systemReminderCount: systemReminders.length,
    systemReminderSize: systemReminders.reduce((sum, m) => sum + m.length, 0),
    hasDuplicateReminders: systemReminders.length > CONFIG.DUPLICATE_WARNING_THRESHOLD,
    estimatedTokens: Math.ceil(contextText.length / 4), // โดยประมาณ 1 token ≈ 4 chars
  };
}

// ==================== CONTEXT CLEANING ====================

/**
 * ลบ system reminders ซ้ำๆ ออก
 */
function cleanSystemReminders(contextText, options = {}) {
  const {
    keepLatest = true, // เก็บเฉพาะอันล่าสุด
    removeAll = false, // ลบทั้งหมด
  } = options;

  if (removeAll) {
    return contextText.replace(CONFIG.SYSTEM_REMINDER_REGEX, '');
  }

  if (keepLatest) {
    const matches = contextText.match(CONFIG.SYSTEM_REMINDER_REGEX) || [];
    if (matches.length <= 1) return contextText;

    // เก็บเฉพาะอันล่าสุด
    const latestReminder = matches[matches.length - 1];
    const cleaned = contextText.replace(CONFIG.SYSTEM_REMINDER_REGEX, '');
    return cleaned + '\n' + latestReminder;
  }

  return contextText;
}

/**
 * สรุป context ให้กระชับ
 */
function summarizeContext(contextText, maxLines = 100) {
  const lines = contextText.split('\n');

  if (lines.length <= maxLines) return contextText;

  // เก็บบางส่วน:
  // 1. 50 บรรทัดแรก
  // 2. 50 บรรทัดสุดท้าย
  // 3. เพิ่มข้อความกลางว่า "..."

  const firstPart = lines.slice(0, 50).join('\n');
  const lastPart = lines.slice(-50).join('\n');
  const middleMessage = `\n... (${lines.length - maxLines} lines skipped to reduce context) ...\n`;

  return firstPart + middleMessage + lastPart;
}

// ==================== MCP TOOLS ====================

/**
 * Tool: analyze_context
 * วิเคราะห์ context ปัจจุบัน
 */
async function analyzeContextTool(args) {
  const { contextPath } = args;

  if (!fs.existsSync(contextPath)) {
    return {
      success: false,
      error: `Context file not found: ${contextPath}`,
    };
  }

  const contextText = fs.readFileSync(contextPath, 'utf-8');
  const analysis = analyzeContext(contextText);

  return {
    success: true,
    analysis: {
      totalSize: `${(analysis.totalSize / 1000).toFixed(2)} KB`,
      totalLines: analysis.totalLines,
      systemReminderCount: analysis.systemReminderCount,
      systemReminderSize: `${(analysis.systemReminderSize / 1000).toFixed(2)} KB`,
      hasDuplicateReminders: analysis.hasDuplicateReminders,
      estimatedTokens: analysis.estimatedTokens,
      recommendations: generateRecommendations(analysis),
    },
  };
}

/**
 * Tool: clean_context
 * ล้าง context ให้กระชับ
 */
async function cleanContextTool(args) {
  const { contextPath, options = {} } = args;

  if (!fs.existsSync(contextPath)) {
    return {
      success: false,
      error: `Context file not found: ${contextPath}`,
    };
  }

  const contextText = fs.readFileSync(contextPath, 'utf-8');
  const originalAnalysis = analyzeContext(contextText);

  // ล้าง context
  let cleaned = cleanSystemReminders(contextText, options);

  // ถ้ายังใหญ่เกินไป ให้ summarize
  if (cleaned.length > CONFIG.MAX_CONTEXT_SIZE && options.summarize !== false) {
    cleaned = summarizeContext(cleaned);
  }

  const cleanedAnalysis = analyzeContext(cleaned);

  // บันทึกไฟล์ใหม่ (ถ้าระบุ output path)
  if (options.outputPath) {
    fs.writeFileSync(options.outputPath, cleaned, 'utf-8');
  }

  return {
    success: true,
    original: {
      size: `${(originalAnalysis.totalSize / 1000).toFixed(2)} KB`,
      lines: originalAnalysis.totalLines,
      systemReminders: originalAnalysis.systemReminderCount,
    },
    cleaned: {
      size: `${(cleanedAnalysis.totalSize / 1000).toFixed(2)} KB`,
      lines: cleanedAnalysis.totalLines,
      systemReminders: cleanedAnalysis.systemReminderCount,
      reduction: `${((1 - cleanedAnalysis.totalSize / originalAnalysis.totalSize) * 100).toFixed(1)}%`,
    },
    cleanedContext: cleaned,
  };
}

/**
 * Tool: optimize_context
 * ปรับปรุง context อัตโนมัติ
 */
async function optimizeContextTool(args) {
  const { contextPath, outputPath } = args;

  // วิเคราะห์ก่อน
  const analysisResult = await analyzeContextTool({ contextPath });
  if (!analysisResult.success) return analysisResult;

  const analysis = analysisResult.analysis;

  // เลือกกลยุทธ์การล้าง
  const cleanOptions = {
    keepLatest: true,
    removeAll: analysis.hasDuplicateReminders && analysis.systemReminderCount > 5,
    summarize: analysis.totalSize > CONFIG.MAX_CONTEXT_SIZE,
    outputPath,
  };

  return await cleanContextTool({ contextPath, options: cleanOptions });
}

// ==================== HELPERS ====================

function generateRecommendations(analysis) {
  const recommendations = [];

  if (analysis.hasDuplicateReminders) {
    recommendations.push({
      severity: 'high',
      issue: 'Duplicate system reminders detected',
      solution: 'Use clean_context tool to remove duplicates',
    });
  }

  if (analysis.systemReminderSize > analysis.totalSize * 0.3) {
    recommendations.push({
      severity: 'medium',
      issue: 'System reminders > 30% of context',
      solution: 'Consider removing outdated reminders',
    });
  }

  if (analysis.totalSize > CONFIG.MAX_CONTEXT_SIZE) {
    recommendations.push({
      severity: 'high',
      issue: `Context size (${(analysis.totalSize / 1000).toFixed(2)} KB) exceeds limit`,
      solution: 'Use summarize_context to reduce size',
    });
  }

  if (analysis.estimatedTokens > 100000) {
    recommendations.push({
      severity: 'high',
      issue: `Estimated tokens (${analysis.estimatedTokens}) very high`,
      solution: 'Drastically reduce context or use CLI mode',
    });
  }

  return recommendations;
}

// ==================== CLI INTERFACE ====================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function runCLI() {
    switch (command) {
      case 'analyze': {
        const contextPath = args[1];
        if (!contextPath) {
          console.error('Usage: node context-manager.js analyze <context-file>');
          process.exit(1);
        }
        const result = await analyzeContextTool({ contextPath });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'clean': {
        const contextPath = args[1];
        const outputPath = args[2] || null;
        if (!contextPath) {
          console.error('Usage: node context-manager.js clean <context-file> [output-file]');
          process.exit(1);
        }
        const result = await cleanContextTool({
          contextPath,
          options: { outputPath },
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'optimize': {
        const contextPath = args[1];
        const outputPath = args[2];
        if (!contextPath) {
          console.error('Usage: node context-manager.js optimize <context-file> [output-file]');
          process.exit(1);
        }
        const result = await optimizeContextTool({ contextPath, outputPath });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        console.log(`
Context Manager - MCP Tool for reducing context bloat

Usage:
  node context-manager.js <command> [args]

Commands:
  analyze <context-file>              Analyze context size and issues
  clean <context-file> [output-file]  Clean duplicate system reminders
  optimize <context-file> [output]    Auto-optimize context

Examples:
  node context-manager.js analyze ./context.txt
  node context-manager.js clean ./context.txt ./cleaned.txt
  node context-manager.js optimize ./context.txt ./optimized.txt
        `);
    }
  }

  runCLI().catch(console.error);
}

// ==================== EXPORTS ====================

module.exports = {
  analyzeContext,
  cleanSystemReminders,
  summarizeContext,
  analyzeContextTool,
  cleanContextTool,
  optimizeContextTool,
};
