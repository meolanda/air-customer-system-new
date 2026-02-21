#!/usr/bin/env node
/**
 * 🛡️ Adversarial Agent - Agent จับผิด Agent
 *
 * ระบบที่ให้ Agent ตรวจสอบงานของ Agent อื่น
 * เหมือกับการมี Code Reviewer 2 คนที่เอาจริงกัน
 */

const { readdirSync, readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const CONFIG = {
  REVIEW_DEPTH: 'medium', // shallow, medium, deep
  STRICT_MODE: true,
  MAX_VIOLATIONS_BEFORE_BLOCK: 10,
  VIOLATION_TYPES: {
    CRITICAL: {
      severity: 'critical',
      blockCommit: true,
      examples: [
        'security vulnerabilities',
        'data loss risks',
        'infinite loops',
        'undefined behavior',
      ],
    },
    HIGH: {
      severity: 'high',
      blockCommit: false,
      examples: [
        'type errors',
        'unused code',
        'missing error handling',
        'performance issues',
      ],
    },
    MEDIUM: {
      severity: 'medium',
      blockCommit: false,
      examples: [
        'code style inconsistencies',
        'missing comments',
        'magic numbers',
        'long functions',
      ],
    },
    LOW: {
      severity: 'low',
      blockCommit: false,
      examples: [
        'formatting issues',
        'minor optimizations',
      ],
    },
  },
};

// ==================== ADVERSARIAL AGENT ====================

class AdversarialAgent {
  constructor(name, role, rules) {
    this.name = name;
    this.role = role;
    this.rules = rules;
    this.violations = [];
  }

  /**
   * ตรวจสอบไฟล์โค้ด
   */
  reviewFile(filePath) {
    const fileViolations = [];

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // ตรวจสอบแต่ละ rule
      for (const rule of this.rules) {
        const ruleViolations = rule.check(filePath, lines, content);
        fileViolations.push(...ruleViolations);
      }
    } catch (error) {
      fileViolations.push({
        rule: 'file-read',
        severity: 'critical',
        message: `Cannot read file: ${error.message}`,
        line: 0,
      });
    }

    this.violations.push(...fileViolations);
    return fileViolations;
  }

  /**
   * ตรวจสอบ directory
   */
  reviewDirectory(dirPath, options = {}) {
    const {
      recursive = true,
      fileExtensions = ['.js', '.ts', '.tsx', '.jsx'],
      excludePatterns = ['node_modules', '.next', 'dist', 'build'],
    } = options;

    const violations = [];

    const traverseDir = (currentPath) => {
      const files = readdirSync(currentPath);

      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const stat = require('fs').statSync(fullPath);

        if (stat.isDirectory()) {
          // ตรวจสอบว่าควร skip หรือไม่
          const shouldSkip = excludePatterns.some(pattern =>
            fullPath.includes(pattern)
          );

          if (!shouldSkip && recursive) {
            traverseDir(fullPath);
          }
        } else {
          // ตรวจสอบไฟล์
          const ext = path.extname(file);
          if (fileExtensions.includes(ext)) {
            const fileViolations = this.reviewFile(fullPath);
            violations.push(...fileViolations);
          }
        }
      }
    };

    traverseDir(dirPath);
    return violations;
  }

  /**
   * สรุปผลการตรวจสอบ
   */
  getSummary() {
    const summary = {
      agent: this.name,
      role: this.role,
      totalViolations: this.violations.length,
      bySeverity: {},
      topIssues: [],
    };

    // รวมตาม severity
    for (const violation of this.violations) {
      const severity = violation.severity || 'unknown';
      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;
    }

    // หาปัญหาที่เกิดบ่อย
    const issueCount = {};
    for (const violation of this.violations) {
      const key = violation.rule || 'unknown';
      issueCount[key] = (issueCount[key] || 0) + 1;
    }

    summary.topIssues = Object.entries(issueCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([issue, count]) => ({ issue, count }));

    return summary;
  }

  /**
   * สร้างรายงาน
   */
  generateReport() {
    const summary = this.getSummary();

    let report = `
╔══════════════════════════════════════════════════════════════╗
║                  🛡️ ADVERSARIAL AGENT REPORT                  ║
╚══════════════════════════════════════════════════════════════╝

Agent: ${this.name}
Role: ${this.role}
Total Violations: ${summary.totalViolations}

`;

    // Violations by Severity
    report += `📊 Violations by Severity:\n\n`;
    for (const [severity, count] of Object.entries(summary.bySeverity)) {
      const emoji = this.getSeverityEmoji(severity);
      report += `  ${emoji} ${severity.toUpperCase()}: ${count}\n`;
    }

    // Top Issues
    report += `\n🔍 Top Issues:\n\n`;
    for (const { issue, count } of summary.topIssues) {
      report += `  • ${issue}: ${count} occurrences\n`;
    }

    // Detailed Violations (ถ้ามี)
    if (this.violations.length > 0 && this.violations.length <= 50) {
      report += `\n📋 Detailed Violations:\n\n`;
      for (const violation of this.violations) {
        report += this.formatViolation(violation);
      }
    }

    report += `\n${'='.repeat(60)}\n`;

    return report;
  }

  /**
   * Format violation สำหรับรายงาน
   */
  formatViolation(violation) {
    const emoji = this.getSeverityEmoji(violation.severity);
    return `${emoji} [${violation.severity.toUpperCase()}] ${violation.message}\n`;
  }

  /**
   * ดึง emoji ตาม severity
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🚨',
      high: '❌',
      medium: '⚠️',
      low: 'ℹ️',
      unknown: '❓',
    };
    return emojis[severity] || emojis.unknown;
  }

  /**
   * เช็คว่าควร block commit หรือไม่
   */
  shouldBlockCommit() {
    const criticalViolations = this.violations.filter(v => v.severity === 'critical');
    return criticalViolations.length > 0;
  }
}

// ==================== REVIEW RULES ====================

class ReviewRule {
  constructor(name, description, severity, checkFn) {
    this.name = name;
    this.description = description;
    this.severity = severity;
    this.checkFn = checkFn;
  }

  check(filePath, lines, content) {
    const violations = [];
    try {
      const results = this.checkFn(filePath, lines, content);
      for (const result of results) {
        violations.push({
          rule: this.name,
          severity: this.severity,
          ...result,
        });
      }
    } catch (error) {
      violations.push({
        rule: this.name,
        severity: 'critical',
        message: `Rule check failed: ${error.message}`,
        line: 0,
      });
    }
    return violations;
  }
}

// ==================== BUILT-IN RULES ====================

const SECURITY_RULES = [
  new ReviewRule(
    'no-eval',
    'ห้ามใช้ eval() - เสี่ยงต่อความปลอดภัย',
    'critical',
    (filePath, lines, content) => {
      const violations = [];
      lines.forEach((line, index) => {
        if (/\beval\s*\(/.test(line)) {
          violations.push({
            message: `Use of eval() at line ${index + 1}`,
            line: index + 1,
            code: line.trim(),
          });
        }
      });
      return violations;
    }
  ),

  new ReviewRule(
    'no-hardcoded-secrets',
    'ห้าม hardcode ความลับ/รหัสผ่าน',
    'critical',
    (filePath, lines, content) => {
      const violations = [];
      const secretPatterns = [
        /password\s*[:=]\s*['"][^'"]+['"]/i,
        /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
        /secret\s*[:=]\s*['"][^'"]+['"]/i,
        /token\s*[:=]\s*['"][^'"]+['"]/i,
      ];

      lines.forEach((line, index) => {
        secretPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            violations.push({
              message: `Possible hardcoded secret at line ${index + 1}`,
              line: index + 1,
              code: line.trim(),
            });
          }
        });
      });

      return violations;
    }
  ),

  new ReviewRule(
    'no-console-log-in-production',
    'ห้าม console.log ใน production',
    'medium',
    (filePath, lines, content) => {
      const violations = [];
      // ข้ามไฟล์ test และ config
      if (filePath.includes('.test.') || filePath.includes('.spec.') ||
          filePath.includes('config') || filePath.includes('.config.')) {
        return violations;
      }

      lines.forEach((line, index) => {
        if (/console\.(log|warn|error|debug)/.test(line) &&
            !line.trim().startsWith('//')) {
          violations.push({
            message: `Console statement at line ${index + 1}`,
            line: index + 1,
            code: line.trim(),
          });
        }
      });

      return violations;
    }
  ),
];

const CODE_QUALITY_RULES = [
  new ReviewRule(
    'no-unused-vars',
    'ห้ามตัวแปรที่ไม่ได้ใช้',
    'high',
    (filePath, lines, content) => {
      const violations = [];
      // Simple check for var/let/const declarations
      // (แบบง่าย - TypeScript จะเช็คได้ดีกว่า)
      const varPattern = /\b(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
      const declaredVars = [];

      lines.forEach((line, index) => {
        let match;
        while ((match = varPattern.exec(line)) !== null) {
          declaredVars.push({
            name: match[2],
            line: index + 1,
          });
        }
      });

      // Check if used (simplified)
      declaredVars.forEach(v => {
        const varName = v.name;
        const usedInFile = content.match(new RegExp(`\\b${varName}\\b`, 'g'));

        if (usedInFile && usedInFile.length <= 1) {
          violations.push({
            message: `Possible unused variable '${varName}' at line ${v.line}`,
            line: v.line,
          });
        }
      });

      return violations;
    }
  ),

  new ReviewRule(
    'no-magic-numbers',
    'ห้าม magic numbers (ค่าที่ไม่รู้ที่มา)',
    'low',
    (filePath, lines, content) => {
      const violations = [];
      // Skip ในไฟล์ test และ config
      if (filePath.includes('.test.') || filePath.includes('.spec.') ||
          filePath.includes('config')) {
        return violations;
      }

      lines.forEach((line, index) => {
        // หาตัวเลขที่ไม่ใช่ 0, 1, 2, 100, 1000
        const magicNumPattern = /\b(?!0|1|2|10|100|1000)\d+\b/g;
        const matches = line.match(magicNumPattern);

        if (matches && matches.length > 0) {
          // ข้ามค่าที่อยู่ใน array/object definitions
          if (!line.includes('[') && !line.includes('{')) {
            violations.push({
              message: `Possible magic number(s) at line ${index + 1}: ${matches.join(', ')}`,
              line: index + 1,
              code: line.trim(),
            });
          }
        }
      });

      return violations;
    }
  ),
];

const PERFORMANCE_RULES = [
  new ReviewRule(
    'no-infinite-loops',
    'ตรวจ infinite loops',
    'critical',
    (filePath, lines, content) => {
      const violations = [];

      // หา loop ที่ไม่มี break condition
      lines.forEach((line, index) => {
        // Simplified check
        if (/while\s*\(\s*true\s*\)/.test(line)) {
          violations.push({
            message: `Possible infinite loop at line ${index + 1}`,
            line: index + 1,
            code: line.trim(),
          });
        }
      });

      return violations;
    }
  ),

  new ReviewRule(
    'no-large-files',
    'ไฟล์ไม่ควรใหญ่เกินไป',
    'medium',
    (filePath, lines, content) => {
      const violations = [];
      const MAX_LINES = 500;

      if (lines.length > MAX_LINES) {
        violations.push({
          message: `File too large: ${lines.length} lines (max: ${MAX_LINES})`,
          line: 0,
        });
      }

      return violations;
    }
  ),
];

// ==================== AGENT FACTORIES ====================

function createSecurityAgent() {
  return new AdversarialAgent(
    'Security Sentinel',
    'รักษาความปลอดภัย',
    SECURITY_RULES
  );
}

function createCodeQualityAgent() {
  return new AdversarialAgent(
    'Code Quality Guardian',
    'รักษาคุณภาพโค้ด',
    CODE_QUALITY_RULES
  );
}

function createPerformanceAgent() {
  return new AdversarialAgent(
    'Performance Monitor',
    'ตรวจสอบประสิทธิภาพ',
    PERFORMANCE_RULES
  );
}

function createComprehensiveAgent() {
  const allRules = [
    ...SECURITY_RULES,
    ...CODE_QUALITY_RULES,
    ...PERFORMANCE_RULES,
  ];

  return new AdversarialAgent(
    'Comprehensive Reviewer',
    'ตรวจสอบครบถุมทุกด้าน',
    allRules
  );
}

// ==================== CLI INTERFACE ====================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function runCLI() {
    switch (command) {
      case 'review': {
        const targetPath = args[1];
        const agentType = args[2] || 'comprehensive';

        if (!targetPath) {
          console.error('Usage: node adversarial-agent.js review <path> [agent-type]');
          console.error('Agent types: security, quality, performance, comprehensive');
          process.exit(1);
        }

        let agent;
        switch (agentType) {
          case 'security':
            agent = createSecurityAgent();
            break;
          case 'quality':
            agent = createCodeQualityAgent();
            break;
          case 'performance':
            agent = createPerformanceAgent();
            break;
          default:
            agent = createComprehensiveAgent();
        }

        const stats = require('fs').statSync(targetPath);
        const isDirectory = stats.isDirectory();

        console.log(`\n🛡️  Reviewing: ${targetPath}`);
        console.log(`Agent: ${agent.name}\n`);

        if (isDirectory) {
          agent.reviewDirectory(targetPath);
        } else {
          agent.reviewFile(targetPath);
        }

        console.log(agent.generateReport());

        if (agent.shouldBlockCommit()) {
          console.log('\n🚨 CRITICAL VIOLATIONS DETECTED!');
          console.log('Commit BLOCKED. Please fix critical issues first.\n');
          process.exit(2);
        }

        break;
      }

      default:
        console.log(`
🛡️  Adversarial Agent - Agent จับผิด Agent

Usage:
  node adversarial-agent.js <command> [args]

Commands:
  review <path> [agent]    Review file/directory
                          Agent types: security, quality, performance, comprehensive

Examples:
  node adversarial-agent.js review ./src
  node adversarial-agent.js review ./src/index.ts security
  node adversarial-agent.js review . comprehensive

Agent Types:
  security         - Security vulnerabilities only
  quality          - Code quality issues only
  performance      - Performance issues only
  comprehensive    - All checks (default)

Exit Codes:
  0  - Success
  1  - Error
  2  - Critical violations (commit blocked)
        `);
    }
  }

  runCLI().catch(console.error);
}

// ==================== EXPORTS ====================

module.exports = {
  AdversarialAgent,
  ReviewRule,
  createSecurityAgent,
  createCodeQualityAgent,
  createPerformanceAgent,
  createComprehensiveAgent,
  CONFIG,
};
