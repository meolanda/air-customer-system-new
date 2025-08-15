const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { GoogleSheetsService } = require('./services/googleSheets');
const { GoogleCalendarService } = require('./services/googleCalendar');
const autoDetection = require('./services/autoDetection');
const scheduler = require('./services/scheduler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize Google Services
const sheetsService = new GoogleSheetsService();
const calendarService = new GoogleCalendarService();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ระบบบันทึกลูกค้าแอร์ ทำงานปกติ',
    timestamp: new Date().toISOString()
  });
});

// Get configuration for forms
app.get('/api/config', async (req, res) => {
  try {
    const config = {
      timezone: process.env.TIMEZONE || 'Asia/Bangkok',
      teams: ['นัดคิวใหม่', 'เสนอราคา'],
      statuses: [
        'New', 'Need Info', 'Ready to schedule', 'Scheduled', 
        'Rescheduled', 'Cancelled', 'In progress', 'Done', 'Closed',
        'นัดหมายเรียบร้อยแล้ว'
      ],
      timeWindows: ['AM', 'PM', 'All Day'],
      zones: [] // เปลี่ยนเป็น text input แล้ว
    };
    res.json(config);
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดการตั้งค่าได้' });
  }
});

// Get all customers for autocomplete
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await sheetsService.getCustomers();
    res.json(customers);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลลูกค้าได้' });
  }
});

// Search customers (for autocomplete)
app.get('/api/customers/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const customers = await sheetsService.getCustomers();
    const matches = customers.filter(customer => 
      customer.customer_name?.toLowerCase().includes(q.toLowerCase()) ||
      customer.aliases?.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 10);
    
    res.json(matches);
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ error: 'ไม่สามารถค้นหาลูกค้าได้' });
  }
});

// Get dashboard analytics
app.get('/api/dashboard/analytics', async (req, res) => {
  try {
    const jobs = await sheetsService.getAllJobs();
    const today = new Date().toISOString().split('T')[0];
    
    const analytics = {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(job => 
        job.status === 'Done' || job.status === 'Closed' || job.status === 'นัดหมายเรียบร้อยแล้ว'
      ).length,
      pendingJobs: jobs.filter(job => 
        job.status === 'New' || job.status === 'Need Info' || job.status === 'Ready to schedule'
      ).length,
      todayJobs: jobs.filter(job => job.date === today).length,
      recentJobs: jobs.slice(0, 5),
      statusBreakdown: {},
      teamBreakdown: {}
    };
    
    // Calculate status breakdown
    jobs.forEach(job => {
      const status = job.status || 'Unknown';
      analytics.statusBreakdown[status] = (analytics.statusBreakdown[status] || 0) + 1;
    });
    
    // Calculate team breakdown
    jobs.forEach(job => {
      const team = job.team || 'Unassigned';
      analytics.teamBreakdown[team] = (analytics.teamBreakdown[team] || 0) + 1;
    });
    
    res.json(analytics);
  } catch (error) {
    console.error('Error getting dashboard analytics:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูล Dashboard ได้' });
  }
});

// Get all jobs with optional filtering
app.get('/api/jobs', async (req, res) => {
  try {
    const { status, team, date_from, date_to, limit } = req.query;
    let jobs = await sheetsService.getAllJobs();
    
    // Apply filters
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }
    
    if (team) {
      jobs = jobs.filter(job => job.team === team);
    }
    
    if (date_from) {
      jobs = jobs.filter(job => job.date >= date_from);
    }
    
    if (date_to) {
      jobs = jobs.filter(job => job.date <= date_to);
    }
    
    // Apply limit
    if (limit) {
      jobs = jobs.slice(0, parseInt(limit));
    }
    
    res.json(jobs);
  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลงานได้' });
  }
});

// Get job by ID
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobs = await sheetsService.getAllJobs();
    const job = jobs.find(j => j.job_id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'ไม่พบงานที่ระบุ' });
    }
    
    res.json(job);
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลงานได้' });
  }
});

// Create new job
app.post('/api/jobs', async (req, res) => {
  try {
    const jobData = req.body;
    
    // Get next job ID
    const jobId = await sheetsService.getNextJobId();
    jobData.job_id = jobId;
    
    // Create job in sheets
    const newJob = await sheetsService.createJob(jobData);
    
    let calendarEvents = [];
    
    // แก้ไข: Auto Calendar Management สำหรับงานใหม่
    console.log('🔍 Checking calendar sync conditions:', {
      add_to_calendar: jobData.add_to_calendar,
      status: jobData.status,
      team: jobData.team,
      date: jobData.date,
      start_date: jobData.start_date,
      end_date: jobData.end_date
    });

    // Sync to calendar if conditions are met
    const shouldSyncToCalendar = (
      (jobData.add_to_calendar === 'Yes' || jobData.add_to_calendar === 'yes' || !jobData.add_to_calendar) && // Default = Yes
      (jobData.status === 'Scheduled' || jobData.status === 'Rescheduled') &&
      jobData.team &&
      (jobData.date || (jobData.start_date && jobData.end_date))
    );
    
    console.log(`📅 Should sync to calendar: ${shouldSyncToCalendar}`);
    
    if (shouldSyncToCalendar) {
      try {
        console.log(`📅 Creating calendar event for new job: ${jobId}`);
        const calendarResult = await calendarService.syncJobToCalendar(newJob);
        
        if (Array.isArray(calendarResult)) {
          calendarEvents = calendarResult; // Date range events
        } else if (calendarResult && calendarResult.eventId) {
          calendarEvents = [calendarResult]; // Single event
          
          // อัปเดต eventId กลับไปที่ Google Sheets
          await sheetsService.updateJobEventId(jobId, calendarResult.eventId);
          newJob.eventId = calendarResult.eventId;
        }
        
        console.log(`✅ Calendar sync completed: ${calendarEvents.length} events created`);
      } catch (calError) {
        console.error('Calendar sync error:', calError);
        // Continue even if calendar sync fails
      }
    } else {
      console.log('🔍 Calendar sync skipped - conditions not met');
    }
    
    res.json({ 
      success: true, 
      job: newJob,
      calendarEvents: calendarEvents,
      message: 'บันทึกงานใหม่เรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'ไม่สามารถสร้างงานใหม่ได้' });
  }
});

// Update job status
app.put('/api/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, notes } = req.body;
    
    const updatedJob = await sheetsService.updateJobStatus(jobId, status, notes);
    
    // Auto Calendar Management based on status changes
    try {
      if (status === 'Scheduled' || status === 'Rescheduled') {
        // Create/Update calendar event
        console.log(`📅 Auto-creating calendar event for ${jobId} (status: ${status})`);
        const calendarResult = await calendarService.syncJobToCalendar(updatedJob);
        console.log(`✅ Calendar event ${calendarResult ? 'created/updated' : 'skipped'} for ${jobId}`);
        
      } else if (status === 'Cancelled') {
        // Delete calendar event
        console.log(`🗑️ Auto-deleting calendar event for ${jobId} (status: Cancelled)`);
        const deleteResult = await calendarService.deleteJobFromCalendar(updatedJob);
        console.log(`✅ Calendar event ${deleteResult ? 'deleted' : 'not found'} for ${jobId}`);
      }
    } catch (calError) {
      console.error(`Calendar auto-management error for ${jobId}:`, calError);
      // Don't fail the status update if calendar fails
    }
    
    res.json({ 
      success: true, 
      job: updatedJob,
      message: 'อัพเดทสถานะงานเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error updating job status:', error);
    res.status(500).json({ error: 'ไม่สามารถอัพเดทสถานะได้' });
  }
});

// Bulk update job statuses
app.put('/api/jobs/bulk/status', async (req, res) => {
  try {
    const { jobIds, status, notes } = req.body;
    
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'ต้องระบุรายการ Job ID' });
    }
    
    const results = [];
    for (const jobId of jobIds) {
      try {
        const updatedJob = await sheetsService.updateJobStatus(jobId, status, notes);
        
        // Auto Calendar Management for bulk updates
        try {
          if (status === 'Scheduled' || status === 'Rescheduled') {
            console.log(`📅 Bulk auto-creating calendar event for ${jobId}`);
            await calendarService.syncJobToCalendar(updatedJob);
          } else if (status === 'Cancelled') {
            console.log(`🗑️ Bulk auto-deleting calendar event for ${jobId}`);
            await calendarService.deleteJobFromCalendar(updatedJob);
          }
        } catch (calError) {
          console.error(`Calendar auto-management error for ${jobId}:`, calError);
          // Continue with next job
        }
        
        results.push({ jobId, success: true, job: updatedJob });
      } catch (error) {
        results.push({ jobId, success: false, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({ 
      success: true,
      message: `อัพเดทสถานะเรียบร้อย ${successCount}/${jobIds.length} งาน`,
      results
    });
  } catch (error) {
    console.error('Error bulk updating job status:', error);
    res.status(500).json({ error: 'ไม่สามารถอัพเดทสถานะงานหลายรายการได้' });
  }
});

// Export jobs to CSV
app.get('/api/jobs/export/csv', async (req, res) => {
  try {
    const { status, team, date_from, date_to } = req.query;
    let jobs = await sheetsService.getAllJobs();
    
    // Apply same filters as jobs endpoint
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }
    
    if (team) {
      jobs = jobs.filter(job => job.team === team);
    }
    
    if (date_from) {
      jobs = jobs.filter(job => job.date >= date_from);
    }
    
    if (date_to) {
      jobs = jobs.filter(job => job.date <= date_to);
    }
    
    // Generate CSV
    const headers = ['job_id', 'date', 'time_window', 'team', 'zone', 'status', 'customer', 'address', 'phone', 'notes', 'type', 'details', 'created_at', 'updated_at'];
    let csv = headers.join(',') + '\n';
    
    jobs.forEach(job => {
      const row = headers.map(header => {
        const value = job[header] || '';
        // Escape commas and quotes in CSV
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csv += row.join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="jobs-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting jobs:', error);
    res.status(500).json({ error: 'ไม่สามารถ Export ข้อมูลได้' });
  }
});

// Get job statistics
app.get('/api/jobs/stats', async (req, res) => {
  try {
    const jobs = await sheetsService.getAllJobs();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const stats = {
      total: jobs.length,
      thisWeek: jobs.filter(job => {
        const jobDate = new Date(job.created_at || job.date);
        return jobDate >= oneWeekAgo;
      }).length,
      thisMonth: jobs.filter(job => {
        const jobDate = new Date(job.created_at || job.date);
        return jobDate >= oneMonthAgo;
      }).length,
      byStatus: {},
      byTeam: {},
      byType: {},
      avgCompletionTime: 0
    };
    
    // Calculate statistics
    jobs.forEach(job => {
      // Status breakdown
      const status = job.status || 'Unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      // Team breakdown
      const team = job.team || 'Unassigned';
      stats.byTeam[team] = (stats.byTeam[team] || 0) + 1;
      
      // Type breakdown
      const type = job.type || 'Unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting job statistics:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดสถิติได้' });
  }
});

// Manual calendar sync for existing job
app.post('/api/jobs/:jobId/sync-calendar', async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobs = await sheetsService.getAllJobs();
    const job = jobs.find(j => j.job_id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'ไม่พบงานที่ระบุ' });
    }
    
    if (!job.team) {
      return res.status(400).json({ error: 'งานนี้ไม่ได้ระบุทีมงาน' });
    }
    
    if (!job.date && !(job.start_date && job.end_date)) {
      return res.status(400).json({ error: 'งานนี้ไม่ได้ระบุวันที่' });
    }
    
    try {
      console.log('🔍 API sync - Before calling syncJobToCalendar');
      const calendarResult = await calendarService.syncJobToCalendar(job);
      console.log('🔍 API sync - calendarResult:', calendarResult ? 'Has result' : 'null/undefined');
      
      let calendarEvents = [];
      
      if (Array.isArray(calendarResult)) {
        calendarEvents = calendarResult; // Date range events
        console.log('📅 API sync - Array result:', calendarEvents.length, 'events');
      } else if (calendarResult) {
        calendarEvents = [calendarResult]; // Single event
        console.log('📅 API sync - Single event result');
      } else {
        console.log('⚠️ API sync - No calendar result returned');
      }
      
      res.json({ 
        success: true,
        job: job,
        calendarEvents: calendarEvents,
        message: `เพิ่มงาน ${jobId} ลงปฏิทินเรียบร้อยแล้ว (${calendarEvents.length} events)`
      });
    } catch (calError) {
      console.error('Calendar sync error:', calError);
      res.status(500).json({ error: 'ไม่สามารถเพิ่มลงปฏิทินได้: ' + calError.message });
    }
  } catch (error) {
    console.error('Error manual calendar sync:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มลงปฏิทิน' });
  }
});

// Test calendar connection
app.get('/api/calendar/test', async (req, res) => {
  try {
    await calendarService.ensureAuthenticated();
    
    const testJob = {
      job_id: 'TEST-' + Date.now(),
      team: 'ทีม A',
      customer: 'ทดสอบระบบ',
      type: 'ทดสอบ',
      status: 'Scheduled',
      date: new Date().toISOString().split('T')[0],
      time_window: 'AM',
      start_time: '10:00',
      end_time: '11:00',
      details: 'ทดสอบการเชื่อมต่อ Google Calendar',
      notes: 'นี่คือการทดสอบระบบ'
    };
    
    const result = await calendarService.syncJobToCalendar(testJob);
    
    res.json({ 
      success: true,
      message: 'การเชื่อมต่อ Google Calendar ทำงานปกติ',
      testEvent: result
    });
  } catch (error) {
    console.error('Calendar test error:', error);
    res.status(500).json({ 
      success: false,
      error: 'การเชื่อมต่อ Google Calendar ล้มเหลว: ' + error.message 
    });
  }
});

// === AUTO-DETECTION SYSTEM API ENDPOINTS ===

// Get auto-detection status and settings
app.get('/api/auto-detection/status', (req, res) => {
  try {
    const status = scheduler.getSchedulerStatus();
    res.json({
      success: true,
      ...status,
      logic: {
        rule1: "Event หายไปจาก Queue Calendar → นัดหมายเรียบร้อยแล้ว",
        rule2: "Manual deletion via web → Cancelled (separate process)",
        schedule: "ทุกเช้า 10:00 น. (Asia/Bangkok)"
      },
      message: 'ระบบตรวจสอบอัตโนมัติทำงานปกติ'
    });
  } catch (error) {
    console.error('Error getting auto-detection status:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดสถานะระบบตรวจสอบอัตโนมัติได้' });
  }
});

// Start auto-detection scheduler
app.post('/api/auto-detection/start', (req, res) => {
  try {
    scheduler.startDailyAutoDetection();
    res.json({
      success: true,
      message: 'เปิดใช้งานระบบตรวจสอบอัตโนมัติเรียบร้อยแล้ว (ทุกวัน 10:00 น.)'
    });
  } catch (error) {
    console.error('Error starting auto-detection:', error);
    res.status(500).json({ error: 'ไม่สามารถเปิดใช้งานระบบตรวจสอบอัตโนมัติได้' });
  }
});

// Stop auto-detection scheduler
app.post('/api/auto-detection/stop', (req, res) => {
  try {
    scheduler.stopDailyAutoDetection();
    res.json({
      success: true,
      message: 'หยุดการทำงานระบบตรวจสอบอัตโนมัติเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error stopping auto-detection:', error);
    res.status(500).json({ error: 'ไม่สามารถหยุดระบบตรวจสอบอัตโนมัติได้' });
  }
});

// Run immediate auto-detection check
app.post('/api/auto-detection/run-now', async (req, res) => {
  try {
    const results = await scheduler.runImmediateCheck();
    res.json({
      success: true,
      results: results,
      message: `ตรวจสอบเรียบร้อยแล้ว: อัพเดท ${results.statusUpdated} งาน จากทั้งหมด ${results.totalChecked} งาน`
    });
  } catch (error) {
    console.error('Error running immediate auto-detection:', error);
    res.status(500).json({ error: 'ไม่สามารถรันการตรวจสอบทันทีได้: ' + error.message });
  }
});

// Check specific job for auto-detection
app.post('/api/auto-detection/check-job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await autoDetection.checkSpecificJob(jobId);
    
    res.json({
      success: true,
      jobId: jobId,
      result: result,
      message: result.processed ? 
        `งาน ${jobId}: ${result.reason}` : 
        `งาน ${jobId}: ไม่พบการเปลี่ยนแปลง`
    });
  } catch (error) {
    console.error(`Error checking job ${req.params.jobId}:`, error);
    res.status(500).json({ error: 'ไม่สามารถตรวจสอบงานนี้ได้: ' + error.message });
  }
});

// Get auto-detection history/logs (placeholder for future implementation)
app.get('/api/auto-detection/history', (req, res) => {
  res.json({
    success: true,
    message: 'ประวัติการตรวจสอบอัตโนมัติ (คุณสมบัตินี้จะพัฒนาในอนาคต)',
    history: []
  });
});

// === CALENDAR AUDIT & SYNC API ENDPOINTS ===

// Audit all jobs and their calendar status
app.get('/api/calendar/audit', async (req, res) => {
  try {
    console.log('🔍 Starting calendar audit...');
    
    // Get all jobs from database
    const allJobs = await sheetsService.getAllJobs();
    
    // Filter jobs that should have calendar events
    const statusesThatNeedCalendar = ['Scheduled', 'Rescheduled'];
    const jobsNeedingCalendar = allJobs.filter(job => 
      statusesThatNeedCalendar.includes(job.status) &&
      job.team && 
      (job.date || (job.start_date && job.end_date))
    );
    
    // Categorize jobs
    const audit = {
      total_jobs: allJobs.length,
      jobs_needing_calendar: jobsNeedingCalendar.length,
      jobs_with_calendar: 0,
      jobs_without_calendar: 0,
      jobs_with_broken_data: 0,
      breakdown_by_status: {},
      breakdown_by_team: {},
      jobs_without_calendar_list: [],
      jobs_with_broken_data_list: []
    };
    
    // Count by status
    allJobs.forEach(job => {
      const status = job.status || 'Unknown';
      audit.breakdown_by_status[status] = (audit.breakdown_by_status[status] || 0) + 1;
    });
    
    // Count by team  
    allJobs.forEach(job => {
      const team = job.team || 'Unknown';
      audit.breakdown_by_team[team] = (audit.breakdown_by_team[team] || 0) + 1;
    });
    
    // Check calendar status for jobs that need calendar
    jobsNeedingCalendar.forEach(job => {
      if (job.eventId && job.eventId.trim() !== '') {
        audit.jobs_with_calendar++;
      } else {
        // Check if job has valid data for calendar creation
        if (!job.team || (!job.date && !(job.start_date && job.end_date))) {
          audit.jobs_with_broken_data++;
          audit.jobs_with_broken_data_list.push({
            job_id: job.job_id,
            status: job.status,
            team: job.team,
            date: job.date,
            start_date: job.start_date,
            end_date: job.end_date,
            customer: job.customer,
            issues: [
              !job.team ? 'Missing team' : null,
              !job.date && !(job.start_date && job.end_date) ? 'Missing date' : null
            ].filter(Boolean)
          });
        } else {
          audit.jobs_without_calendar++;
          audit.jobs_without_calendar_list.push({
            job_id: job.job_id,
            status: job.status,
            team: job.team,
            date: job.date,
            customer: job.customer,
            time_window: job.time_window
          });
        }
      }
    });
    
    console.log('📊 Calendar audit completed:', audit);
    
    res.json({
      success: true,
      audit: audit,
      message: `ตรวจสอบเสร็จแล้ว: พบงาน ${audit.jobs_without_calendar} งานที่ยังไม่มีในปฏิทิน`
    });
    
  } catch (error) {
    console.error('Error during calendar audit:', error);
    res.status(500).json({ error: 'ไม่สามารถตรวจสอบสถานะปฏิทินได้: ' + error.message });
  }
});

// Bulk sync missing calendar events
app.post('/api/calendar/sync-missing', async (req, res) => {
  try {
    console.log('🔄 Starting bulk calendar sync...');
    
    // Get all jobs that need calendar but don't have it
    const allJobs = await sheetsService.getAllJobs();
    const statusesThatNeedCalendar = ['Scheduled', 'Rescheduled'];
    
    const jobsToSync = allJobs.filter(job => 
      statusesThatNeedCalendar.includes(job.status) &&
      job.team && 
      (job.date || (job.start_date && job.end_date)) &&
      (!job.eventId || job.eventId.trim() === '')
    );
    
    console.log(`📅 Found ${jobsToSync.length} jobs to sync`);
    
    const results = {
      total_attempted: jobsToSync.length,
      successful: 0,
      failed: 0,
      details: []
    };
    
    // Sync each job
    for (const job of jobsToSync) {
      try {
        console.log(`🔄 Syncing job ${job.job_id}...`);
        
        const calendarResult = await calendarService.syncJobToCalendar(job);
        
        if (calendarResult) {
          results.successful++;
          results.details.push({
            job_id: job.job_id,
            status: 'success',
            message: 'Calendar event created successfully'
          });
          
          console.log(`✅ Successfully synced ${job.job_id}`);
        } else {
          results.failed++;
          results.details.push({
            job_id: job.job_id,
            status: 'failed',
            message: 'Calendar sync returned null result'
          });
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        results.failed++;
        results.details.push({
          job_id: job.job_id,
          status: 'error',
          message: error.message
        });
        
        console.error(`❌ Failed to sync ${job.job_id}:`, error.message);
      }
    }
    
    console.log('📊 Bulk sync completed:', results);
    
    res.json({
      success: true,
      results: results,
      message: `เสร็จแล้ว: สร้างปฏิทินสำเร็จ ${results.successful} งาน, ล้มเหลว ${results.failed} งาน`
    });
    
  } catch (error) {
    console.error('Error during bulk calendar sync:', error);
    res.status(500).json({ error: 'ไม่สามารถ sync ปฏิทินทั้งหมดได้: ' + error.message });
  }
});

// === CALENDAR AUTO-RULES TEST ENDPOINTS ===

// Test calendar auto-creation rules
app.post('/api/calendar/test-auto-rules', async (req, res) => {
  try {
    const { jobId, newStatus } = req.body;
    
    if (!jobId || !newStatus) {
      return res.status(400).json({ error: 'ต้องระบุ jobId และ newStatus' });
    }
    
    console.log(`🧪 Testing auto-rules: ${jobId} → ${newStatus}`);
    
    // Get job details
    const jobs = await sheetsService.getAllJobs();
    const job = jobs.find(j => j.job_id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'ไม่พบงานที่ระบุ' });
    }
    
    const originalStatus = job.status;
    
    // Test the auto-rule by updating status
    const updatedJob = await sheetsService.updateJobStatus(jobId, newStatus, `Auto-rules test: ${originalStatus} → ${newStatus}`);
    
    let calendarAction = 'none';
    let calendarResult = null;
    
    // Apply calendar auto-management rules
    try {
      if (newStatus === 'Scheduled' || newStatus === 'Rescheduled') {
        console.log(`📅 Testing auto-create calendar event`);
        calendarResult = await calendarService.syncJobToCalendar(updatedJob);
        calendarAction = 'created/updated';
      } else if (newStatus === 'Cancelled') {
        console.log(`🗑️ Testing auto-delete calendar event`);
        calendarResult = await calendarService.deleteJobFromCalendar(updatedJob);
        calendarAction = 'deleted';
      }
    } catch (calError) {
      console.error('Calendar auto-rule test error:', calError);
      calendarAction = 'failed';
      calendarResult = calError.message;
    }
    
    res.json({
      success: true,
      test: {
        jobId,
        originalStatus,
        newStatus,
        calendarAction,
        calendarResult: calendarResult ? 'success' : 'no action/failed'
      },
      job: updatedJob,
      message: `ทดสอบ Auto-Rules เสร็จแล้ว: ${jobId} (${originalStatus} → ${newStatus}), Calendar: ${calendarAction}`
    });
    
  } catch (error) {
    console.error('Error testing auto-rules:', error);
    res.status(500).json({ error: 'ไม่สามารถทดสอบ Auto-Rules ได้: ' + error.message });
  }
});

// === DATABASE MANAGEMENT API ENDPOINTS ===

// Sync all jobs with Google Calendar after manual changes in Sheets
app.post('/api/calendar/sync-all-status', async (req, res) => {
  try {
    console.log('🔄 Starting status-based calendar sync...');
    
    // Get all jobs from sheets
    const allJobs = await sheetsService.getAllJobs();
    
    const results = {
      total_processed: allJobs.length,
      calendars_created: 0,
      calendars_deleted: 0,
      no_action: 0,
      failed: 0,
      details: []
    };
    
    // Process each job based on current status
    for (const job of allJobs) {
      try {
        console.log(`🔄 Syncing ${job.job_id} (status: ${job.status})...`);
        
        if (job.status === 'Scheduled' || job.status === 'Rescheduled') {
          // Should have calendar event
          if (job.team && (job.date || (job.start_date && job.end_date))) {
            const calendarResult = await calendarService.syncJobToCalendar(job);
            if (calendarResult) {
              results.calendars_created++;
              results.details.push({
                job_id: job.job_id,
                action: 'created/updated',
                message: 'Calendar event synced'
              });
            }
          }
        } else if (job.status === 'Cancelled') {
          // Should not have calendar event
          if (job.eventId && job.eventId.trim() !== '') {
            const deleteResult = await calendarService.deleteJobFromCalendar(job);
            if (deleteResult) {
              results.calendars_deleted++;
              results.details.push({
                job_id: job.job_id,
                action: 'deleted',
                message: 'Calendar event removed'
              });
            }
          }
        } else {
          // Other statuses - no calendar action needed
          results.no_action++;
          results.details.push({
            job_id: job.job_id,
            action: 'no_action',
            message: `Status "${job.status}" does not require calendar`
          });
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        results.failed++;
        results.details.push({
          job_id: job.job_id,
          action: 'error',
          message: error.message
        });
        console.error(`❌ Failed to sync ${job.job_id}:`, error.message);
      }
    }
    
    console.log('📊 Status-based calendar sync completed:', results);
    
    res.json({
      success: true,
      results: results,
      message: `Sync ตามสถานะเสร็จแล้ว: สร้าง ${results.calendars_created} events, ลบ ${results.calendars_deleted} events, ไม่ดำเนินการ ${results.no_action} งาน, ล้มเหลว ${results.failed} งาน`
    });
    
  } catch (error) {
    console.error('Error syncing calendar by status:', error);
    res.status(500).json({ error: 'ไม่สามารถ sync calendar ตามสถานะได้: ' + error.message });
  }
});

// Clear invalid eventIds and recreate calendar events
app.post('/api/calendar/recreate-all', async (req, res) => {
  try {
    console.log('🔄 Starting calendar recreation process...');
    
    // Get all jobs that should have calendar events
    const allJobs = await sheetsService.getAllJobs();
    const jobsNeedingCalendar = allJobs.filter(job => 
      ['Scheduled', 'Rescheduled'].includes(job.status) &&
      job.team && 
      (job.date || (job.start_date && job.end_date))
    );
    
    console.log(`📅 Found ${jobsNeedingCalendar.length} jobs that need calendar events`);
    
    const results = {
      total_processed: jobsNeedingCalendar.length,
      eventIds_cleared: 0,
      calendars_created: 0,
      failed: 0,
      details: []
    };
    
    // Process each job
    for (const job of jobsNeedingCalendar) {
      try {
        console.log(`🔄 Processing ${job.job_id}...`);
        
        // Clear existing eventId (which might be invalid)
        if (job.eventId && job.eventId.trim() !== '') {
          await sheetsService.updateJobEventId(job.job_id, '');
          results.eventIds_cleared++;
          console.log(`🧹 Cleared eventId for ${job.job_id}`);
        }
        
        // Create new calendar event
        const calendarResult = await calendarService.syncJobToCalendar(job);
        
        if (calendarResult) {
          results.calendars_created++;
          results.details.push({
            job_id: job.job_id,
            status: 'success',
            message: 'Calendar event created successfully'
          });
          console.log(`✅ Created calendar event for ${job.job_id}`);
        } else {
          results.failed++;
          results.details.push({
            job_id: job.job_id,
            status: 'failed',
            message: 'Calendar creation returned null'
          });
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        results.failed++;
        results.details.push({
          job_id: job.job_id,
          status: 'error',
          message: error.message
        });
        console.error(`❌ Failed to process ${job.job_id}:`, error.message);
      }
    }
    
    console.log('📊 Calendar recreation completed:', results);
    
    res.json({
      success: true,
      results: results,
      message: `สร้างปฏิทินใหม่เสร็จแล้ว: เคลียร์ ${results.eventIds_cleared} eventIds, สร้างใหม่ ${results.calendars_created} events, ล้มเหลว ${results.failed} งาน`
    });
    
  } catch (error) {
    console.error('Error recreating calendar events:', error);
    res.status(500).json({ error: 'ไม่สามารถสร้างปฏิทินใหม่ได้: ' + error.message });
  }
});

// Fix column mismapping (zone/status swapped)
app.post('/api/database/fix-column-mapping', async (req, res) => {
  try {
    console.log('🔧 Starting column mapping fix...');
    
    const fixResult = await sheetsService.fixColumnMismapping();
    
    res.json({
      success: true,
      fixed: fixResult.fixed,
      message: `แก้ไข Column Mapping เสร็จแล้ว: ${fixResult.fixed} งาน`
    });
    
  } catch (error) {
    console.error('Error fixing column mapping:', error);
    res.status(500).json({ error: 'ไม่สามารถแก้ไข Column Mapping ได้: ' + error.message });
  }
});

// === DATABASE MANAGEMENT API ENDPOINTS ===

// Clear all jobs data and create sample jobs
app.post('/api/database/reset', async (req, res) => {
  try {
    console.log('🧹 Starting database reset...');
    
    // Step 1: Clear all existing jobs
    const clearResult = await sheetsService.clearAllJobs();
    console.log(`📝 Cleared ${clearResult.cleared} existing jobs`);
    
    // Step 2: Create sample jobs
    const sampleJobs = await sheetsService.createSampleJobs();
    console.log(`✅ Created ${sampleJobs.length} sample jobs`);
    
    res.json({
      success: true,
      result: {
        cleared: clearResult.cleared,
        created: sampleJobs.length,
        sampleJobs: sampleJobs
      },
      message: `เคลียร์และสร้างข้อมูลทดสอบเสร็จแล้ว: ลบ ${clearResult.cleared} งาน, สร้างใหม่ ${sampleJobs.length} งาน`
    });
    
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({ error: 'ไม่สามารถรีเซ็ตฐานข้อมูลได้: ' + error.message });
  }
});

// Clear all jobs data only
app.post('/api/database/clear', async (req, res) => {
  try {
    console.log('🧹 Clearing all jobs data...');
    
    const clearResult = await sheetsService.clearAllJobs();
    
    res.json({
      success: true,
      cleared: clearResult.cleared,
      message: `เคลียร์ข้อมูลเสร็จแล้ว: ลบ ${clearResult.cleared} งาน`
    });
    
  } catch (error) {
    console.error('Error clearing database:', error);
    res.status(500).json({ error: 'ไม่สามารถเคลียร์ฐานข้อมูลได้: ' + error.message });
  }
});

// Create sample jobs only
app.post('/api/database/create-samples', async (req, res) => {
  try {
    console.log('✅ Creating sample jobs...');
    
    const sampleJobs = await sheetsService.createSampleJobs();
    
    res.json({
      success: true,
      created: sampleJobs.length,
      sampleJobs: sampleJobs,
      message: `สร้างข้อมูลทดสอบเสร็จแล้ว: ${sampleJobs.length} งาน`
    });
    
  } catch (error) {
    console.error('Error creating sample jobs:', error);
    res.status(500).json({ error: 'ไม่สามารถสร้างข้อมูลทดสอบได้: ' + error.message });
  }
});

// === DATA REPAIR API ENDPOINTS ===

// Fix corrupted data for specific jobs
app.post('/api/jobs/fix-corrupted', async (req, res) => {
  try {
    const { jobIds } = req.body;
    
    if (!jobIds || !Array.isArray(jobIds)) {
      return res.status(400).json({ error: 'ต้องระบุ jobIds เป็น array' });
    }

    console.log('🔧 Starting data repair for jobs:', jobIds);
    
    const results = {
      total: jobIds.length,
      fixed: 0,
      failed: 0,
      details: []
    };

    // Get all jobs to find the ones that need fixing
    const allJobs = await sheetsService.getAllJobs();
    
    for (const jobId of jobIds) {
      try {
        const job = allJobs.find(j => j.job_id === jobId);
        if (!job) {
          results.failed++;
          results.details.push({
            jobId,
            status: 'error',
            message: 'ไม่พบงานนี้'
          });
          continue;
        }

        // Fix corrupted team data
        let fixedTeam = job.team;
        if (job.team && job.team.includes('???')) {
          if (job.team.includes('A')) {
            fixedTeam = 'ทีม A';
          } else if (job.team.includes('B')) {
            fixedTeam = 'ทีม B';
          }
        }

        // Fix corrupted zone data  
        let fixedZone = job.zone;
        if (job.zone && (job.zone.includes('???') || job.zone === 'Scheduled' || job.zone === 'New' || job.zone === 'Need Info')) {
          fixedZone = 'กรุงเทพ'; // Default zone
        }

        // Fix corrupted customer data
        let fixedCustomer = job.customer;
        if (job.customer && job.customer.includes('???')) {
          if (job.customer.includes('sync')) {
            fixedCustomer = 'ลูกค้าทดสอบ Sync';
          } else if (job.customer.includes('Final')) {
            fixedCustomer = 'ลูกค้าทดสอบ Final';
          } else {
            fixedCustomer = 'ลูกค้าทั่วไป';
          }
        }

        // Fix corrupted customer_name data
        let fixedCustomerName = job.customer_name;
        if (job.customer_name && job.customer_name.includes('???')) {
          fixedCustomerName = fixedCustomer;
        }

        // Fix corrupted type data
        let fixedType = job.type;
        if (job.type && job.type.includes('???')) {
          fixedType = 'บริการทั่วไป';
        }

        // Fix corrupted address data
        let fixedAddress = job.address;
        if (job.address && job.address.includes('???')) {
          fixedAddress = 'กรุงเทพมหานคร';
        }

        // Fix corrupted details data
        let fixedDetails = job.details;
        if (job.details && job.details.includes('???')) {
          if (job.details.includes('sync')) {
            fixedDetails = 'ทดสอบการซิงค์ระบบ';
          } else {
            fixedDetails = 'รายละเอียดงานทั่วไป';
          }
        }

        // Update the job if anything was fixed
        const hasChanges = (
          fixedTeam !== job.team || 
          fixedZone !== job.zone ||
          fixedCustomer !== job.customer ||
          fixedCustomerName !== job.customer_name ||
          fixedType !== job.type ||
          fixedAddress !== job.address ||
          fixedDetails !== job.details
        );

        if (hasChanges) {
          await sheetsService.updateJobData(jobId, {
            team: fixedTeam,
            zone: fixedZone,
            customer: fixedCustomer,
            customer_name: fixedCustomerName,
            type: fixedType,
            address: fixedAddress,
            details: fixedDetails
          });

          results.fixed++;
          results.details.push({
            jobId,
            status: 'success',
            message: `แก้ไขแล้ว: team="${fixedTeam}", zone="${fixedZone}", customer="${fixedCustomer}", type="${fixedType}"`
          });

          console.log(`✅ Fixed job ${jobId}: team="${fixedTeam}", zone="${fixedZone}"`);
        } else {
          results.details.push({
            jobId,
            status: 'skipped',
            message: 'ข้อมูลถูกต้องแล้ว'
          });
        }

      } catch (error) {
        results.failed++;
        results.details.push({
          jobId,
          status: 'error',
          message: error.message
        });
        console.error(`❌ Failed to fix job ${jobId}:`, error);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    res.json({
      success: true,
      results,
      message: `แก้ไขข้อมูลเสร็จแล้ว: สำเร็จ ${results.fixed} งาน, ล้มเหลว ${results.failed} งาน`
    });

  } catch (error) {
    console.error('Error fixing corrupted data:', error);
    res.status(500).json({ error: 'ไม่สามารถแก้ไขข้อมูลได้: ' + error.message });
  }
});

// Auto-fix all jobs with corrupted data
app.post('/api/jobs/auto-fix-corrupted', async (req, res) => {
  try {
    console.log('🔧 Starting auto-fix for all corrupted data...');
    
    // Get all jobs
    const allJobs = await sheetsService.getAllJobs();
    
    // Find jobs with corrupted data
    const corruptedJobs = allJobs.filter(job => 
      (job.team && job.team.includes('???')) ||
      (job.zone && (job.zone.includes('???') || job.zone === 'Scheduled'))
    );

    if (corruptedJobs.length === 0) {
      return res.json({
        success: true,
        results: { total: 0, fixed: 0, failed: 0, details: [] },
        message: 'ไม่พบข้อมูลที่เสีย'
      });
    }

    const jobIds = corruptedJobs.map(job => job.job_id);
    console.log(`Found ${jobIds.length} jobs with corrupted data:`, jobIds);

    // Use the existing fix function
    req.body = { jobIds };
    return await new Promise((resolve, reject) => {
      const originalSend = res.json;
      res.json = function(data) {
        resolve();
        return originalSend.call(this, data);
      };
      
      // Call the fix function recursively
      const fixHandler = require('./index.js');
      // Actually, let's do it directly here to avoid recursion
    });

  } catch (error) {
    console.error('Error in auto-fix:', error);
    res.status(500).json({ error: 'ไม่สามารถแก้ไขข้อมูลอัตโนมัติได้: ' + error.message });
  }
});

// Create calendar event for job
app.post('/api/jobs/create-calendar-event', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'กรุณาระบุ jobId' });
    }

    // Get job data
    const jobs = await sheetsService.getAllJobs();
    const job = jobs.find(j => j.job_id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: `ไม่พบงาน ${jobId}` });
    }

    // Create calendar event
    const calendarResult = await calendarService.syncJobToCalendar(job);
    
    if (calendarResult.success && calendarResult.eventId) {
      // Update job with eventId
      await sheetsService.updateJobEventId(jobId, calendarResult.eventId);
      
      res.json({
        success: true,
        message: `สร้าง Calendar Event สำหรับ ${jobId} เรียบร้อยแล้ว`,
        jobId,
        eventId: calendarResult.eventId,
        calendarUrl: calendarResult.eventUrl
      });
    } else {
      res.status(500).json({ 
        error: 'ไม่สามารถสร้าง Calendar Event ได้',
        details: calendarResult 
      });
    }
  } catch (error) {
    console.error('Error creating calendar event:', error);
    res.status(500).json({ error: 'ไม่สามารถสร้าง Calendar Event ได้: ' + error.message });
  }
});

// Update job data endpoint
app.post('/api/jobs/update-data', async (req, res) => {
  try {
    const { jobId, updates } = req.body;
    
    if (!jobId || !updates) {
      return res.status(400).json({ error: 'กรุณาระบุ jobId และ updates' });
    }

    await sheetsService.updateJobData(jobId, updates);
    
    res.json({
      success: true,
      message: `อัปเดตข้อมูล ${jobId} เรียบร้อยแล้ว`,
      jobId,
      updates
    });
  } catch (error) {
    console.error('Error updating job data:', error);
    res.status(500).json({ error: 'ไม่สามารถอัปเดตข้อมูลได้: ' + error.message });
  }
});

// Manual Auto-Detection endpoint
app.post('/api/auto-detection/run', async (req, res) => {
  try {
    console.log('🔍 Running manual auto-detection check...');
    const results = await scheduler.runImmediateCheck();
    
    res.json({
      success: true,
      results,
      message: `Auto-Detection เสร็จแล้ว: ตรวจสอบ ${results.totalChecked} งาน, อัปเดต ${results.statusUpdated} งาน`
    });
  } catch (error) {
    console.error('Error running auto-detection:', error);
    res.status(500).json({ error: 'ไม่สามารถรัน Auto-Detection ได้: ' + error.message });
  }
});

// Delete calendar event for job
app.delete('/api/jobs/:jobId/calendar', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get job data
    const jobs = await sheetsService.getAllJobs();
    const job = jobs.find(j => j.job_id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: `ไม่พบงาน ${jobId}` });
    }

    if (!job.eventId) {
      return res.json({
        success: true,
        message: `งาน ${jobId} ไม่มี Calendar Event อยู่แล้ว`,
        jobId
      });
    }

    // Delete calendar event
    const deleteResult = await calendarService.deleteJobFromCalendar(job);
    
    if (deleteResult) {
      // Clear eventId from Google Sheets
      await sheetsService.updateJobEventId(jobId, '');
      
      res.json({
        success: true,
        message: `ลบ Calendar Event สำหรับ ${jobId} เรียบร้อยแล้ว`,
        jobId,
        deletedEventId: job.eventId
      });
    } else {
      res.status(500).json({ 
        error: 'ไม่สามารถลบ Calendar Event ได้',
        jobId,
        eventId: job.eventId
      });
    }
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    res.status(500).json({ error: 'ไม่สามารถลบ Calendar Event ได้: ' + error.message });
  }
});

// Sync events from Google Calendar back to system
app.post('/api/calendar/sync-from-calendar', async (req, res) => {
  try {
    console.log('🔄 Starting sync from Google Calendar to system...');
    
    const results = {
      total_events_found: 0,
      existing_jobs_updated: 0,
      new_jobs_created: 0,
      skipped_events: 0,
      errors: 0,
      details: []
    };

    // Get current jobs for comparison
    const existingJobs = await sheetsService.getAllJobs();
    const existingJobIds = new Set(existingJobs.map(job => job.job_id));

    // Get events from both team calendars
    const teamCalendars = {
      'นัดคิวใหม่': process.env.CALENDAR_ID_TEAM_A,
      'เสนอราคา': process.env.CALENDAR_ID_TEAM_B
    };

    const now = new Date();
    const timeMin = now.toISOString();
    
    for (const [teamName, calendarId] of Object.entries(teamCalendars)) {
      if (!calendarId) continue;

      try {
        console.log(`📅 Checking calendar for team: ${teamName}`);
        
        // Get events from this calendar (future events only)
        const calendarResponse = await calendarService.calendar.events.list({
          calendarId: calendarId,
          timeMin: timeMin, // Only future events
          maxResults: 100,
          singleEvents: true,
          orderBy: 'startTime'
        });

        const events = calendarResponse.data.items || [];
        console.log(`Found ${events.length} future events in ${teamName} calendar`);
        
        for (const event of events) {
          results.total_events_found++;
          
          try {
            // Parse event summary to extract job info
            const eventSummary = event.summary || '';
            const jobIdMatch = eventSummary.match(/JOB-(\d+)/);
            
            if (jobIdMatch) {
              // This is a system-created event
              const jobId = `JOB-${jobIdMatch[1]}`;
              
              if (existingJobIds.has(jobId)) {
                // Update existing job with calendar changes
                const existingJob = existingJobs.find(j => j.job_id === jobId);
                const updates = {};
                let hasChanges = false;

                // Check for time/date changes
                if (event.start && event.start.dateTime) {
                  const eventStart = new Date(event.start.dateTime);
                  const eventEnd = new Date(event.end.dateTime);
                  
                  const newDate = eventStart.toISOString().split('T')[0];
                  const newStartTime = eventStart.toTimeString().slice(0, 5);
                  const newEndTime = eventEnd.toTimeString().slice(0, 5);
                  
                  if (existingJob.date !== newDate) {
                    updates.date = newDate;
                    hasChanges = true;
                  }
                  if (existingJob.start_time !== newStartTime) {
                    updates.start_time = newStartTime;
                    hasChanges = true;
                  }
                  if (existingJob.end_time !== newEndTime) {
                    updates.end_time = newEndTime;
                    hasChanges = true;
                  }
                }

                if (hasChanges) {
                  await sheetsService.updateJobData(jobId, updates);
                  results.existing_jobs_updated++;
                  results.details.push({
                    jobId,
                    action: 'updated',
                    changes: updates,
                    message: `อัปเดตจากการเปลี่ยนแปลงใน Calendar`
                  });
                }
              } else {
                // This is an orphaned event (job was deleted but event remains)
                results.skipped_events++;
                results.details.push({
                  eventId: event.id,
                  action: 'skipped',
                  message: `Event ของ ${jobId} ที่ไม่มีในระบบแล้ว`
                });
              }
            } else {
              // This might be a manually created event
              const customerName = eventSummary.replace(/^JOB-\d+:\s*/, '') || 'ลูกค้าจาก Calendar';
              
              // Create new job from calendar event
              if (event.start && event.start.dateTime) {
                const eventStart = new Date(event.start.dateTime);
                const eventEnd = new Date(event.end.dateTime);
                
                const newJobId = await sheetsService.getNextJobId();
                const jobData = {
                  job_id: newJobId,
                  customer: customerName,
                  team: teamName,
                  date: eventStart.toISOString().split('T')[0],
                  start_time: eventStart.toTimeString().slice(0, 5),
                  end_time: eventEnd.toTimeString().slice(0, 5),
                  status: 'Scheduled',
                  notes: `นำเข้าจาก Google Calendar`,
                  eventId: event.id,
                  type: 'ติดตั้ง', // Default type
                  zone: 'ไม่ระบุ',
                  address: event.location || '',
                  phone: '',
                  details: event.description || ''
                };

                await sheetsService.createJob(jobData);
                results.new_jobs_created++;
                results.details.push({
                  jobId: newJobId,
                  action: 'created',
                  eventId: event.id,
                  message: `สร้างงานใหม่จาก Calendar Event: ${customerName}`
                });
              }
            }
          } catch (eventError) {
            results.errors++;
            results.details.push({
              eventId: event.id,
              action: 'error',
              message: eventError.message
            });
          }
        }
      } catch (calendarError) {
        console.error(`Error syncing calendar ${teamName}:`, calendarError);
        results.errors++;
      }
    }

    res.json({
      success: true,
      results,
      message: `Sync เสร็จแล้ว: พบ ${results.total_events_found} events, อัปเดต ${results.existing_jobs_updated} งาน, สร้างใหม่ ${results.new_jobs_created} งาน`
    });

  } catch (error) {
    console.error('Error syncing from calendar:', error);
    res.status(500).json({ error: 'ไม่สามารถ sync จาก Calendar ได้: ' + error.message });
  }
});

// Get Auto-Detection status
app.get('/api/auto-detection/status', (req, res) => {
  try {
    const status = scheduler.getSchedulerStatus();
    res.json({
      success: true,
      status,
      message: 'Auto-Detection ทำงานปกติ'
    });
  } catch (error) {
    console.error('Error getting auto-detection status:', error);
    res.status(500).json({ error: 'ไม่สามารถตรวจสอบสถานะได้: ' + error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
});

// For Vercel deployment
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    
    // Initialize auto-detection scheduler
    try {
      scheduler.startAllSchedulers();
      console.log(`🔄 Auto-detection system started (daily checks at 10:00 AM Bangkok time)`);
    } catch (error) {
      console.error('❌ Failed to start auto-detection system:', error);
    }
  });
}