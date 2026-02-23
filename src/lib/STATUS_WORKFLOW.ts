/**
 * 🔄 Status Workflow Configuration
 * ระบบสถานะที่ติดตัวกับงาน เคลื่อนที่ไปตามเส้นทางที่ชัดเจน
 */

export type StatusValue =
  | 'new'                    // รับเรื่องใหม่
  | 'queue'                  // จองคิว/นัดหมาย
  | 'waiting_quote'          // ขอใบเสนอราคา
  | 'checking_parts'         // เช็คอะไหล่ + เสนอราคา
  | 'send_quote'             // ส่งใบเสนอราคาแล้ว
  | 'waiting_response'       // รอลูกค้าตอบกลับ
  | 'waiting_send'           // รอส่งลูกค้า
  | 'sent'                   // ส่งลูกค้าแล้ว
  | 'completed'             // เสร็จสิ้น
  | 'cancelled';             // ยกเลิก

export interface StatusConfig {
  value: StatusValue;
  label: string;
  icon: string;
  color: string;
  description: string;
  // สถานะถัดไปที่เป็นไปได้
  nextStatuses: StatusValue[];
  // สถานะก่อนหน้าที่สามารถย้อนกลับมาได้
  previousStatuses: StatusValue[];
  // ต้องกรอกข้อมูลอะไรเพิ่มเติมบ้าง
  requiredFields?: string[];
  // ข้อความแนะนำสำหรับปุ่มถัดไป
  nextButtonLabel?: string;
  // อยู่ในเส้นทางไหน (path)
  workflowPath: 'queue' | 'quote' | 'both' | 'terminal';
}

/**
 * 🗺️ Status Map
 * แต่ละสถานะรู้เส้นทางของตัวเอง
 */
export const STATUS_CONFIG: Record<StatusValue, StatusConfig> = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // สถานะเริ่มต้น - งานใหม่ทุกงานต้องมาผ่านตรงนี้ก่อน
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  new: {
    value: 'new',
    label: 'รับเรื่องใหม่',
    icon: '📥',
    color: 'bg-blue-100 text-blue-800',
    description: 'งานใหม่เข้ามาแล้ว',
    nextStatuses: ['queue', 'waiting_quote', 'checking_parts', 'cancelled'],
    previousStatuses: [],
    nextButtonLabel: 'เลือกเส้นทาง',
    workflowPath: 'both',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // เส้นทางที่ 1: คิวงาน (Queue Path)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  queue: {
    value: 'queue',
    label: 'จองคิว / นัดหมาย',
    icon: '📋',
    color: 'bg-yellow-100 text-yellow-800',
    description: 'นัดหมายวัน/เวลาทำงาน',
    nextStatuses: ['waiting_send', 'cancelled'],
    previousStatuses: ['new', 'waiting_quote', 'checking_parts'],
    requiredFields: ['appointmentDate'],
    nextButtonLabel: 'นัดหมายแล้ว → ส่งลูกค้า',
    workflowPath: 'queue',
  },

  waiting_send: {
    value: 'waiting_send',
    label: 'รอส่งลูกค้า',
    icon: '📤',
    color: 'bg-purple-100 text-purple-800',
    description: 'เสร็จแล้ว รอส่งมอบให้ลูกค้า',
    nextStatuses: ['sent', 'completed', 'cancelled'],
    previousStatuses: ['queue', 'checking_parts', 'waiting_response'],
    nextButtonLabel: 'ส่งลูกค้าแล้ว',
    workflowPath: 'both',
  },

  sent: {
    value: 'sent',
    label: 'ส่งลูกค้าแล้ว',
    icon: '✅',
    color: 'bg-green-100 text-green-800',
    description: 'ส่งมอบงานให้ลูกค้าแล้ว',
    nextStatuses: ['completed', 'cancelled'],
    previousStatuses: ['waiting_send'],
    nextButtonLabel: 'เสร็จสิ้น',
    workflowPath: 'both',
  },

  completed: {
    value: 'completed',
    label: 'เสร็จสิ้น',
    icon: '🏁',
    color: 'bg-gray-100 text-gray-800',
    description: 'งานเสร็จสมบูรณ์',
    nextStatuses: [],
    previousStatuses: ['sent'],
    workflowPath: 'terminal',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // เส้นทางที่ 2: ใบเสนอราคา (Quote Path)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  waiting_quote: {
    value: 'waiting_quote',
    label: 'ขอใบเสนอราคา',
    icon: '💰',
    color: 'bg-orange-100 text-orange-800',
    description: 'ลูกค้าต้องการใบเสนอราคา',
    nextStatuses: ['checking_parts', 'queue', 'cancelled'],
    previousStatuses: ['new'],
    nextButtonLabel: 'ดูอะไหล่ + เสนอราคา',
    workflowPath: 'quote',
  },

  checking_parts: {
    value: 'checking_parts',
    label: 'เช็คอะไหล่ + เสนอราคา',
    icon: '🔧',
    color: 'bg-indigo-100 text-indigo-800',
    description: 'ตรวจสอบอะไหล่และคำนวณราคา',
    nextStatuses: ['send_quote', 'waiting_send', 'queue', 'cancelled'],
    previousStatuses: ['new', 'waiting_quote', 'waiting_response'],
    requiredFields: ['quoteAmount'],
    nextButtonLabel: 'ส่งใบเสนอราคาแล้ว',
    workflowPath: 'quote',
  },

  send_quote: {
    value: 'send_quote',
    label: 'ส่งใบเสนอราคาแล้ว',
    icon: '📨',
    color: 'bg-teal-100 text-teal-800',
    description: 'ฝ่ายแอดมินส่งใบเสนอราคาให้ลูกค้าแล้ว',
    nextStatuses: ['waiting_response', 'cancelled'],
    previousStatuses: ['checking_parts'],
    nextButtonLabel: 'รอลูกค้าตอบกลับ',
    workflowPath: 'quote',
  },

  waiting_response: {
    value: 'waiting_response',
    label: 'รอลูกค้าตอบกลับ',
    icon: '⏳',
    color: 'bg-amber-100 text-amber-800',
    description: 'รอลูกค้าตอบรับใบเสนอราคา',
    nextStatuses: ['waiting_send', 'checking_parts', 'queue', 'cancelled'],
    previousStatuses: ['send_quote'],
    nextButtonLabel: 'ลูกค้าตอบตกลง → ส่งลูกค้า',
    workflowPath: 'quote',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // สถานะพิเศษ: ยกเลิก (สามารถเข้าถึงได้จากทุกสถานะ)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  cancelled: {
    value: 'cancelled',
    label: 'ยกเลิก',
    icon: '❌',
    color: 'bg-red-100 text-red-800',
    description: 'ลูกค้ายกเลิกงาน',
    nextStatuses: [],
    previousStatuses: [],
    requiredFields: ['cancelReason'],
    workflowPath: 'terminal',
  },
};

/**
 * 🔄 Get Status Config
 * ดึง config ของสถานะที่ระบุ
 */
export function getStatusConfig(status: StatusValue): StatusConfig {
  return STATUS_CONFIG[status];
}

/**
 * 👣 Get Next Statuses
 * ดึงสถานะถัดไปที่เป็นไปได้
 */
export function getNextStatuses(currentStatus: StatusValue): StatusValue[] {
  return STATUS_CONFIG[currentStatus].nextStatuses;
}

/**
 * ←← Get Previous Statuses
 * ดึงสถานะก่อนหน้าที่สามารถย้อนกลับมาได้
 */
export function getPreviousStatuses(currentStatus: StatusValue): StatusValue[] {
  return STATUS_CONFIG[currentStatus].previousStatuses;
}

/**
 * ✅ Can Transition To
 * เช็คว่าสามารถเปลี่ยนจากสถานะ A → สถานะ B ได้ไหม
 */
export function canTransitionTo(
  fromStatus: StatusValue,
  toStatus: StatusValue
): boolean {
  const allowedNext = getStatusConfig(fromStatus).nextStatuses;
  return allowedNext.includes(toStatus);
}

/**
 * 🗺️ Get Workflow Path
 * ดูว่าอยู่ในเส้นทางไหน (queue, quote, both, terminal)
 */
export function getWorkflowPath(status: StatusValue): string {
  return STATUS_CONFIG[status].workflowPath;
}

/**
 * 🚦 Is Terminal Status
 * เช็คว่าเป็นสถานะสุดท้ายหรือยัง (เสร็จสิ้น/ยกเลิก)
 */
export function isTerminalStatus(status: StatusValue): boolean {
  return getWorkflowPath(status) === 'terminal';
}

/**
 * 📊 Get Status Progress
 * คำนวณ progress % (สำหรับ progress bar)
 */
export function getStatusProgress(status: StatusValue): number {
  const progressMap: Record<StatusValue, number> = {
    new: 10,
    queue: 30,
    waiting_quote: 20,
    checking_parts: 35,
    send_quote: 45,
    waiting_response: 55,
    waiting_send: 70,
    sent: 85,
    completed: 100,
    cancelled: 0,
  };
  return progressMap[status];
}

/**
 * 🎯 Get Primary Next Status
 * ดึงสถานะถัดไปหลัก (สำหรับปุ่มใหญ่)
 * จะเลือกอันที่ "น่าจะ" เป็นถัดไป ตามเส้นทาง
 */
export function getPrimaryNextStatus(currentStatus: StatusValue): StatusValue | null {
  const nextStatuses = getNextStatuses(currentStatus);

  // ถ้ามีถัดไปเดียว ใช้เลย
  if (nextStatuses.length === 1 && nextStatuses[0] !== 'cancelled') {
    return nextStatuses[0] || null;
  }

  // ถ้ามีหลายตัวเลือก เอาตัวแรกที่ไม่ใช่ cancel
  const nonCancelNext = nextStatuses.filter(s => s !== 'cancelled');
  if (nonCancelNext.length === 1) {
    return nonCancelNext[0] || null;
  }

  // ถ้ายังเลือกไม่ได้ คืน null
  return null;
}

/**
 * 🏷️ Format Status Label
 * จัด format label ให้สวยงาม
 */
export function formatStatusLabel(status: StatusValue): string {
  const config = getStatusConfig(status);
  return `${config.icon} ${config.label}`;
}
