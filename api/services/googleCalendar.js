const { google } = require('googleapis');

class GoogleCalendarService {
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.calendarIds = {
      'ทีม A': process.env.CALENDAR_ID_TEAM_A,        // สำหรับข้อมูลเก่า
      'ทีม B': process.env.CALENDAR_ID_TEAM_B,        // สำหรับข้อมูลเก่า
      'นัดคิวใหม่': process.env.CALENDAR_ID_TEAM_A,    // ชื่อใหม่
      'เสนอราคา': process.env.CALENDAR_ID_TEAM_B      // ชื่อใหม่
    };
    this.initialize();
  }

  async initialize() {
    try {
      // Use the same auth as sheets service
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

      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      console.log('✅ Google Calendar service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar service:', error);
      throw error;
    }
  }

  async ensureAuthenticated() {
    if (!this.auth || !this.calendar) {
      await this.initialize();
    }
  }

  // Sync job to appropriate team calendar (supports both single date and date range)
  async syncJobToCalendar(job) {
    await this.ensureAuthenticated();

    try {
      console.log('🔍 syncJobToCalendar called with:', {
        jobId: job.job_id,
        team: job.team,
        dateType: job.date_type,
        date: job.date,
        startDate: job.start_date,
        endDate: job.end_date,
        startTime: job.start_time,
        endTime: job.end_time
      });

      // Handle corrupted team data (??? A, ??? B)
      let teamName = job.team;
      if (teamName && teamName.includes('???')) {
        if (teamName.includes('A')) {
          teamName = 'ทีม A';
        } else if (teamName.includes('B')) {
          teamName = 'ทีม B';
        }
        console.log(`🔧 Fixed corrupted team name: "${job.team}" → "${teamName}"`);
      }

      const calendarId = this.calendarIds[teamName];
      if (!calendarId) {
        console.warn(`No calendar configured for team: ${teamName} (original: ${job.team})`);
        console.log('Available teams:', Object.keys(this.calendarIds));
        return null;
      }

      console.log(`📅 Using calendar for team "${teamName}": ${calendarId.substring(0, 20)}...`);

      // Check if this is a date range job
      if (job.date_type === 'range' && job.start_date && job.end_date) {
        console.log('📅 Using date range events');
        const result = await this.createDateRangeEvents(job, calendarId);
        console.log('📅 Date range events result:', result ? result.length : 'null');
        return result;
      } else {
        console.log('📅 Using single date event');
        const result = await this.createSingleDateEvent(job, calendarId);
        console.log('📅 Single date event result:', result ? 'Event created' : 'null');
        
        // If result is null but no error was thrown, it means the event creation was skipped
        // Return a simple success indicator instead of null
        if (!result) {
          console.log('⚠️ createSingleDateEvent returned null - calendar sync may have been skipped');
        }
        
        return result;
      }
    } catch (error) {
      console.error('Error syncing to calendar:', error);
      throw error;
    }
  }

  // Create calendar events for date range
  async createDateRangeEvents(job, calendarId) {
    console.log('🔍 createDateRangeEvents called with:', {
      jobId: job.job_id,
      startDate: job.start_date,
      endDate: job.end_date,
      dateType: job.date_type
    });

    if (!job.start_date || !job.end_date) {
      console.error('❌ Missing start_date or end_date for range events');
      throw new Error('Date range jobs require start_date and end_date');
    }

    const events = [];
    const startDate = new Date(job.start_date);
    const endDate = new Date(job.end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('❌ Invalid start_date or end_date:', {
        startDate: job.start_date,
        endDate: job.end_date
      });
      throw new Error('Invalid date format in start_date or end_date');
    }
    
    // Loop through each day in the range
    for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Create a copy of job data for this specific date
      const dailyJob = {
        ...job,
        date: dateStr,
        job_id: `${job.job_id}-${dateStr}` // Unique ID for each day
      };
      
      const event = await this.createSingleDateEvent(dailyJob, calendarId);
      if (event) {
        events.push(event);
      }
    }
    
    console.log(`📅 Created ${events.length} calendar events for date range: ${job.job_id}`);
    return events;
  }

  // Create calendar event for single date
  async createSingleDateEvent(job, calendarId) {
    console.log('🔍 createSingleDateEvent called with job:', {
      jobId: job.job_id,
      date: job.date,
      startTime: job.start_time,
      endTime: job.end_time,
      calendarId: calendarId
    });

    // Use the correct field names from our job object
    const scheduledDate = job.date; // Format: YYYY-MM-DD
    let startTime = job.start_time || '09:00'; // Format: HH:MM
    let endTime = job.end_time || '17:00'; // Format: HH:MM
    
    // แก้ปัญหา end_time = "0:00" โดยใช้เวลาตาม time_window
    if (endTime === '0:00' || endTime === '00:00') {
      const timeWindow = job.time_window;
      console.log(`🔧 Fixing invalid end_time "0:00" using time_window: ${timeWindow}`);
      
      switch (timeWindow) {
        case 'AM':
          startTime = '09:00';
          endTime = '12:00';
          break;
        case 'PM':
          startTime = '13:00';
          endTime = '17:00';
          break;
        case 'All Day':
          startTime = '08:00';
          endTime = '18:00';
          break;
        default:
          // ถ้าไม่มี time_window หรือเป็นค่าอื่น ให้ใช้เวลาเริ่มต้น
          if (startTime === '09:00' || startTime === '9:00') {
            endTime = '12:00'; // AM default
          } else if (startTime >= '13:00') {
            endTime = '17:00'; // PM default
          } else {
            endTime = '17:00'; // General default
          }
      }
      
      console.log(`✅ Fixed time: ${startTime} - ${endTime}`);
    }

    if (!scheduledDate) {
      console.warn('❌ No scheduled date provided for calendar sync');
      return null;
    }

    console.log('✅ Dates validated, proceeding with calendar creation');

    // Normalize time format (ensure HH:MM format)
    const normalizeTime = (time) => {
      if (!time) return null;
      
      // Convert to string if it's a number
      const timeStr = String(time).trim();
      
      // If time is already HH:MM format, normalize hours
      if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':');
        return `${hours.padStart(2, '0')}:${minutes}`;
      }
      
      // If time is H:MM format (like "9:00"), normalize to HH:MM
      if (/^\d{1}:\d{2}$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':');
        return `${hours.padStart(2, '0')}:${minutes}`;
      }
      
      // If time is just hours (like "9"), add ":00"
      if (/^\d{1,2}$/.test(timeStr)) {
        return `${timeStr.padStart(2, '0')}:00`;
      }
      
      // If time is H:M format (like "9:0"), normalize to HH:MM
      if (/^\d{1,2}:\d{1}$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':');
        return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
      }
      
      // If time contains only digits (like "900" for 9:00), try to parse
      if (/^\d{3,4}$/.test(timeStr)) {
        if (timeStr.length === 3) {
          // Format: "900" -> "09:00"
          return `0${timeStr[0]}:${timeStr.slice(1)}`;
        } else if (timeStr.length === 4) {
          // Format: "1700" -> "17:00"
          return `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`;
        }
      }
      
      console.warn(`Unable to normalize time format: "${timeStr}"`);
      return null;
    };

    const normalizedStartTime = normalizeTime(startTime);
    const normalizedEndTime = normalizeTime(endTime);

    console.log('🔍 Debug time normalization:', {
      originalStartTime: startTime,
      originalEndTime: endTime,
      normalizedStartTime,
      normalizedEndTime,
      scheduledDate
    });

    // Create datetime for Thailand timezone
    const startDateTimeStr = normalizedStartTime ? 
      `${scheduledDate}T${normalizedStartTime}:00+07:00` : 
      `${scheduledDate}T09:00:00+07:00`;
      
    const endDateTimeStr = normalizedEndTime ? 
      `${scheduledDate}T${normalizedEndTime}:00+07:00` : 
      `${scheduledDate}T17:00:00+07:00`;

    console.log('🔍 Debug datetime strings:', {
      startDateTimeStr,
      endDateTimeStr
    });

    const startDateTime = new Date(startDateTimeStr);
    const endDateTime = new Date(endDateTimeStr);

    console.log('🔍 Debug created dates:', {
      startDateTime: startDateTime.toString(),
      endDateTime: endDateTime.toString(),
      startValid: !isNaN(startDateTime.getTime()),
      endValid: !isNaN(endDateTime.getTime())
    });

    // Validate dates
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      console.error('❌ Invalid date/time values:', { 
        scheduledDate, 
        startTime, 
        endTime, 
        normalizedStartTime, 
        normalizedEndTime,
        startDateTimeStr,
        endDateTimeStr
      });
      throw new Error('Invalid date or time format provided');
    }

    // If time_window is All Day, make it an all-day event
    const isAllDay = job.time_window === 'All Day';

    const event = {
      summary: `${job.job_id}: ${job.customer || job.customer_name || 'ลูกค้า'}`,
      description: `ประเภทงาน: ${job.type || 'ไม่ระบุ'}\n` +
                  `ลูกค้า: ${job.customer || job.customer_name || 'ไม่ระบุ'}\n` +
                  `โทร: ${job.phone || job.customer_phone || 'ไม่ระบุ'}\n` +
                  `ที่อยู่: ${job.address || job.customer_address || 'ไม่ระบุ'}\n` +
                  `สถานะ: ${job.status || 'ไม่ระบุ'}\n` +
                  `ช่วงเวลา: ${job.time_window || 'ไม่ระบุ'}\n` +
                  `รายละเอียด: ${job.details || job.job_description || 'ไม่มี'}\n` +
                  `หมายเหตุ: ${job.notes || 'ไม่มี'}`,
      location: job.address || job.customer_address || '',
      attendees: [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 }, // 1 hour before
          { method: 'popup', minutes: 15 }, // 15 minutes before
        ],
      },
    };

    // Set date/time based on whether it's all day or not
    if (isAllDay) {
      event.start = {
        date: scheduledDate,
        timeZone: 'Asia/Bangkok',
      };
      event.end = {
        date: scheduledDate,
        timeZone: 'Asia/Bangkok',
      };
    } else {
      event.start = {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Asia/Bangkok',
      };
      event.end = {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Asia/Bangkok',
      };
    }

    // Check if event already exists
    const existingEvent = await this.findExistingEvent(calendarId, job.job_id);
    
    let result;
    if (existingEvent) {
      // Update existing event
      result = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: existingEvent.id,
        resource: event,
      });
      console.log(`📅 Updated calendar event for job: ${job.job_id}`);
    } else {
      // Create new event
      result = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
      });
      console.log(`📅 Created calendar event for job: ${job.job_id}`);
    }

    // Update job with eventId if we created/updated successfully
    if (result.data && result.data.id) {
      try {
        // Import the GoogleSheetsService to update eventId
        const { GoogleSheetsService } = require('./googleSheets');
        const sheetsService = new GoogleSheetsService();
        await sheetsService.updateJobEventId(job.job_id, result.data.id);
        console.log(`📝 Updated job ${job.job_id} with eventId: ${result.data.id}`);
      } catch (updateError) {
        console.error(`⚠️ Failed to update eventId for job ${job.job_id}:`, updateError.message);
        // Don't throw error - calendar event was created successfully
      }
    }

    return result.data;
  }

  // Find existing calendar event by job ID
  async findExistingEvent(calendarId, jobId) {
    try {
      const response = await this.calendar.events.list({
        calendarId: calendarId,
        q: jobId, // Search for job ID in event summary
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      return events.find(event => event.summary && event.summary.includes(jobId));
    } catch (error) {
      console.error('Error finding existing event:', error);
      return null;
    }
  }

  // Delete calendar event for a job
  async deleteJobFromCalendar(job) {
    await this.ensureAuthenticated();

    try {
      const calendarId = this.calendarIds[job.team];
      if (!calendarId) return null;

      const existingEvent = await this.findExistingEvent(calendarId, job.job_id);
      if (existingEvent) {
        await this.calendar.events.delete({
          calendarId: calendarId,
          eventId: existingEvent.id,
        });
        console.log(`📅 Deleted calendar event for job: ${job.job_id}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting from calendar:', error);
      throw error;
    }
  }
}

module.exports = { GoogleCalendarService };