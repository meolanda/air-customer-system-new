const { google } = require('googleapis');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = process.env.SPREADSHEET_ID;
    this.initialize();
  }

  async initialize() {
    try {
      // Setup authentication
      this.auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/calendar'
        ],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      console.log('✅ Google Sheets service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets service:', error);
      throw error;
    }
  }

  async ensureAuthenticated() {
    if (!this.auth || !this.sheets) {
      await this.initialize();
    }
  }

  // Get customers for autocomplete
  async getCustomers() {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.CUSTOMERS_SHEET_NAME || 'Customers';
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:G`, // customer_id to active columns
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      const headers = rows[0];
      const customers = rows.slice(1).map(row => {
        const customer = {};
        headers.forEach((header, index) => {
          customer[header] = row[index] || '';
        });
        return customer;
      }).filter(customer => customer.active !== 'false'); // Only active customers

      return customers;
    } catch (error) {
      console.error('Error getting customers:', error);
      throw error;
    }
  }

  // Get all jobs
  async getAllJobs() {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`, // Get all columns
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      const headers = rows[0];
      const jobs = rows.slice(1).map(row => {
        const job = {};
        headers.forEach((header, index) => {
          job[header] = row[index] || '';
        });
        return job;
      });

      // Sort by created date (newest first)
      return jobs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    } catch (error) {
      console.error('Error getting jobs:', error);
      throw error;
    }
  }

  // Get next job ID
  async getNextJobId() {
    await this.ensureAuthenticated();
    
    try {
      const jobs = await this.getAllJobs();
      let maxId = 0;
      
      jobs.forEach(job => {
        // Only process valid job IDs (not empty, not "/", not whitespace)
        if (job.job_id && 
            job.job_id.trim() !== '' && 
            job.job_id !== '/' && 
            job.job_id.startsWith('JOB-')) {
          const idNum = parseInt(job.job_id.replace('JOB-', ''));
          if (!isNaN(idNum) && idNum > maxId) {
            maxId = idNum;
          }
        }
      });

      const nextId = `JOB-${String(maxId + 1).padStart(6, '0')}`;
      console.log(`✅ Generated next job ID: ${nextId}`);
      return nextId;
    } catch (error) {
      console.error('Error getting next job ID:', error);
      throw error;
    }
  }

  // Create new job
  async createJob(jobData) {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';
      const now = new Date();
      const bangkokTime = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(now);

      // Prepare job data matching CSV structure
      const newJob = {
        job_id: jobData.job_id,
        date: jobData.scheduled_date || jobData.date || '',
        time_window: jobData.time_window || jobData.scheduled_time || '',
        team: jobData.team || '',
        zone: jobData.zone || '',
        status: jobData.status || 'New',
        customer: jobData.customer_name || jobData.customer || '',
        address: jobData.customer_address || jobData.address || '',
        phone: jobData.customer_phone || jobData.phone || '',
        notes: jobData.notes || '',
        eventId: jobData.eventId || '',
        type: jobData.type || jobData.job_description || '',
        is_calendar: jobData.is_calendar || 'Y',
        start_time: jobData.start_time || '',
        end_time: jobData.end_time || '',
        details: jobData.details || jobData.job_description || '',
        map_url: jobData.map_url || '',
        created_at: bangkokTime,
        updated_at: bangkokTime,
        status_changed_at: bangkokTime,
        customer_id: jobData.customer_id || '',
        customer_name: jobData.customer_name || jobData.customer || '',
        branch: jobData.branch || ''
      };

      // Get headers to ensure correct column order
      const headerResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!1:1`,
      });

      const headers = headerResponse.data.values?.[0] || [];
      
      // Create row data in correct order
      const rowData = headers.map(header => newJob[header] || '');

      // Append the new job
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [rowData]
        }
      });

      console.log(`✅ Created job: ${newJob.job_id}`);
      return newJob;
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }

  // Update job status
  async updateJobStatus(jobId, status, notes = '') {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';
      const jobs = await this.getAllJobs();
      
      const jobIndex = jobs.findIndex(job => job.job_id === jobId);
      if (jobIndex === -1) {
        throw new Error(`Job ${jobId} not found`);
      }

      const rowNumber = jobIndex + 2; // +1 for header, +1 for 0-based index
      const bangkokTime = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date());

      // Update status and timestamp - แก้ไข column mapping
      const updates = [
        {
          range: `${sheetName}!F${rowNumber}`, // Status is column F (not E)
          values: [[status]]
        },
        {
          range: `${sheetName}!S${rowNumber}`, // Updated_date is column S
          values: [[bangkokTime]]
        }
      ];

      if (notes) {
        updates.push({
          range: `${sheetName}!J${rowNumber}`, // Notes is column J
          values: [[notes]]
        });
      }

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });

      const updatedJob = { ...jobs[jobIndex], status, updated_date: bangkokTime };
      if (notes) updatedJob.notes = notes;

      console.log(`✅ Updated job ${jobId} status to: ${status}`);
      return updatedJob;
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  }

  // Update job eventId
  async updateJobEventId(jobId, eventId) {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';
      const jobs = await this.getAllJobs();
      
      const jobIndex = jobs.findIndex(job => job.job_id === jobId);
      if (jobIndex === -1) {
        throw new Error(`Job ${jobId} not found`);
      }

      const rowNumber = jobIndex + 2; // +1 for header, +1 for 0-based index
      
      // Update eventId column (column K based on CSV)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!K${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[eventId]]
        }
      });

      console.log(`📝 Updated eventId for job ${jobId}: ${eventId}`);
      return true;
    } catch (error) {
      console.error('Error updating job eventId:', error);
      throw error;
    }
  }

  // Update multiple job fields
  async updateJobData(jobId, updateData) {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';
      const jobs = await this.getAllJobs();
      
      const jobIndex = jobs.findIndex(job => job.job_id === jobId);
      if (jobIndex === -1) {
        throw new Error(`Job ${jobId} not found`);
      }

      const rowNumber = jobIndex + 2; // +1 for header, +1 for 0-based index
      const updates = [];

      // Map fields to columns (based on CSV header order)
      // Header: job_id,date,time_window,team,zone,status,customer,address,phone,notes,eventId,type,is_calendar,start_time,end_time,details,map_url,created_at,updated_at,status_changed_at,customer_id,customer_name,branch
      const fieldColumnMap = {
        'job_id': 'A',         // Column A
        'date': 'B',           // Column B
        'time_window': 'C',    // Column C
        'team': 'D',           // Column D
        'zone': 'E',           // Column E
        'status': 'F',         // Column F
        'customer': 'G',       // Column G
        'address': 'H',        // Column H
        'phone': 'I',          // Column I
        'notes': 'J',          // Column J
        'eventId': 'K',        // Column K
        'type': 'L',           // Column L
        'is_calendar': 'M',    // Column M
        'start_time': 'N',     // Column N
        'end_time': 'O',       // Column O
        'details': 'P',        // Column P
        'map_url': 'Q',        // Column Q
        'created_at': 'R',     // Column R
        'updated_at': 'S',     // Column S
        'status_changed_at': 'T', // Column T
        'customer_id': 'U',    // Column U
        'customer_name': 'V',  // Column V
        'branch': 'W'          // Column W
      };

      // Create update requests for each field
      Object.entries(updateData).forEach(([field, value]) => {
        if (fieldColumnMap[field]) {
          updates.push({
            range: `${sheetName}!${fieldColumnMap[field]}${rowNumber}`,
            values: [[value]]
          });
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Execute batch update
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });

      console.log(`📝 Updated job ${jobId} with data:`, updateData);
      return true;
    } catch (error) {
      console.error('Error updating job data:', error);
      throw error;
    }
  }

  // Clear all jobs data (keep only header)
  async clearAllJobs() {
    await this.ensureAuthenticated();
    
    try {
      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';
      
      // Get current data to determine range
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) {
        console.log('📝 No jobs data to clear');
        return { cleared: 0 };
      }

      // Clear all data except header (row 1)
      const lastRow = rows.length;
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:Z${lastRow}`,
      });

      const clearedCount = lastRow - 1;
      console.log(`🧹 Cleared ${clearedCount} jobs from database`);
      return { cleared: clearedCount };
    } catch (error) {
      console.error('Error clearing jobs:', error);
      throw error;
    }
  }

  // Create sample test jobs
  async createSampleJobs() {
    await this.ensureAuthenticated();
    
    try {
      const now = new Date();
      const bangkokTime = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(now);

      // Sample jobs data
      const sampleJobs = [
        {
          job_id: 'JOB-000001',
          date: '2025-08-16',
          time_window: 'AM',
          team: 'นัดคิวใหม่',
          zone: 'กรุงเทพ',
          status: 'New',
          customer: 'บริษัท ABC จำกัด',
          address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
          phone: '02-123-4567',
          notes: 'ลูกค้าใหม่ ติดตั้งแอร์ 3 เครื่อง',
          eventId: '',
          type: 'ติดตั้ง',
          is_calendar: 'Y',
          start_time: '09:00',
          end_time: '12:00',
          details: 'ติดตั้งแอร์บ้าน 3 เครื่อง พร้อมท่อทองแดงและสายไฟ',
          map_url: '',
          created_at: bangkokTime,
          updated_at: bangkokTime,
          status_changed_at: bangkokTime,
          customer_id: 'CUST001',
          customer_name: 'บริษัท ABC จำกัด',
          branch: 'สำนักงานใหญ่'
        },
        {
          job_id: 'JOB-000002',
          date: '2025-08-17',
          time_window: 'PM', 
          team: 'เสนอราคา',
          zone: 'บางนา',
          status: 'Need Info',
          customer: 'คุณสมชาย รักดี',
          address: '456 ซอยลาซาล แขวงบางนา เขตบางนา กรุงเทพฯ 10260',
          phone: '081-234-5678',
          notes: 'รอข้อมูลเพิ่มเติมจากลูกค้า',
          eventId: '',
          type: 'เสนอราคา',
          is_calendar: 'Y',
          start_time: '13:00',
          end_time: '16:00',
          details: 'สำรวจหน้างานและเสนอราคาบำรุงรักษาแอร์ 5 เครื่อง',
          map_url: '',
          created_at: bangkokTime,
          updated_at: bangkokTime,
          status_changed_at: bangkokTime,
          customer_id: 'CUST002',
          customer_name: 'คุณสมชาย รักดี',
          branch: ''
        }
      ];

      const sheetName = process.env.JOBS_SHEET_NAME || 'Jobs';

      // Get headers to ensure correct column order
      const headerResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!1:1`,
      });

      const headers = headerResponse.data.values?.[0] || [];
      
      // Create rows data in correct order
      const rowsData = sampleJobs.map(job => 
        headers.map(header => job[header] || '')
      );

      // Append sample jobs
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: rowsData
        }
      });

      console.log(`✅ Created ${sampleJobs.length} sample jobs`);
      return sampleJobs;
    } catch (error) {
      console.error('Error creating sample jobs:', error);
      throw error;
    }
  }

  // Fix zone/status column confusion
  async fixColumnMismapping() {
    await this.ensureAuthenticated();
    
    try {
      const jobs = await this.getAllJobs();
      let fixedCount = 0;
      
      for (const job of jobs) {
        // Check if zone and status are swapped
        const needsFix = (
          // Zone contains status value
          ['New', 'Scheduled', 'Rescheduled', 'Cancelled', 'Need Info', 'In progress', 'Done', 'Closed', 'นัดหมายเรียบร้อยแล้ว'].includes(job.zone) ||
          // Status contains zone value  
          ['กรุงเทพ', 'บางนา', 'ลาดกระบัง', 'สมุทรปราการ', 'นนทบุรี'].includes(job.status)
        );
        
        if (needsFix) {
          console.log(`🔄 Fixing column mismapping for ${job.job_id}: zone="${job.zone}" <-> status="${job.status}"`);
          
          // Swap zone and status
          const correctZone = job.status;  // Status field contains the zone
          const correctStatus = job.zone;  // Zone field contains the status
          
          await this.updateJobData(job.job_id, {
            zone: correctZone,
            status: correctStatus
          });
          
          fixedCount++;
        }
      }
      
      console.log(`✅ Fixed column mismapping for ${fixedCount} jobs`);
      return { fixed: fixedCount };
    } catch (error) {
      console.error('Error fixing column mismapping:', error);
      throw error;
    }
  }
}

module.exports = { GoogleSheetsService };