const { google } = require('googleapis');
const { GoogleSheetsService } = require('./googleSheets');

class AutoDetectionService {
    constructor() {
        this.calendar = google.calendar('v3');
        this.sheets = new GoogleSheetsService();
        
        // Queue Calendar IDs (from environment) - รองรับทั้งชื่อเก่าและใหม่
        this.queueCalendars = {
            'ทีม A': process.env.CALENDAR_ID_TEAM_A,        // ชื่อเก่า
            'ทีม B': process.env.CALENDAR_ID_TEAM_B,        // ชื่อเก่า
            'นัดคิวใหม่': process.env.CALENDAR_ID_TEAM_A,    // ชื่อใหม่
            'เสนอราคา': process.env.CALENDAR_ID_TEAM_B      // ชื่อใหม่
        };
        
        // Personal Calendar patterns (common Thai calendar names)
        this.personalCalendarPatterns = [
            'งานส่วนตัว',
            'personal',
            'ส่วนตัว',
            'นัดหมายส่วนตัว',
            'ปฏิทินส่วนตัว',
            'งานส่วนบุคคล'
        ];
    }

    async initializeAuth() {
        try {
            const auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: process.env.GOOGLE_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
                },
                scopes: [
                    'https://www.googleapis.com/auth/calendar',
                    'https://www.googleapis.com/auth/calendar.events'
                ]
            });

            this.authClient = await auth.getClient();
            google.options({ auth: this.authClient });
            
            return true;
        } catch (error) {
            console.error('Auto-Detection Auth Error:', error);
            return false;
        }
    }

    async getUserCalendars() {
        try {
            const response = await this.calendar.calendarList.list();
            return response.data.items || [];
        } catch (error) {
            console.error('Error fetching user calendars:', error);
            return [];
        }
    }

    async isPersonalCalendar(calendarId, calendarSummary = '') {
        // Check if calendar ID matches queue calendars
        const queueCalendarIds = Object.values(this.queueCalendars);
        if (queueCalendarIds.includes(calendarId)) {
            return false; // This is a queue calendar
        }

        // Check if calendar name matches personal patterns
        const summary = calendarSummary.toLowerCase();
        const isPersonal = this.personalCalendarPatterns.some(pattern => 
            summary.includes(pattern.toLowerCase())
        );

        return isPersonal;
    }

    async checkEventMoved(jobId, originalEventId, queueCalendarId) {
        try {
            // First, check if event still exists in queue calendar
            try {
                await this.calendar.events.get({
                    calendarId: queueCalendarId,
                    eventId: originalEventId
                });
                
                // Event still exists in queue calendar - not moved
                return { moved: false, deletedFromQueue: false };
            } catch (error) {
                if (error.code === 404) {
                    // Event not found in queue calendar - check if moved or deleted
                    const moveResult = await this.searchEventInPersonalCalendars(originalEventId, jobId);
                    
                    return {
                        moved: moveResult.found,
                        deletedFromQueue: true,
                        newCalendarId: moveResult.calendarId,
                        newCalendarName: moveResult.calendarName
                    };
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error(`Error checking event movement for job ${jobId}:`, error);
            return { moved: false, deletedFromQueue: false, error: error.message };
        }
    }

    async searchEventInPersonalCalendars(eventId, jobId) {
        try {
            const calendars = await this.getUserCalendars();
            
            for (const calendar of calendars) {
                // Skip queue calendars
                if (Object.values(this.queueCalendars).includes(calendar.id)) {
                    continue;
                }

                try {
                    // Search for event by ID
                    const event = await this.calendar.events.get({
                        calendarId: calendar.id,
                        eventId: eventId
                    });

                    if (event.data) {
                        // Check if this is a personal calendar
                        const isPersonal = await this.isPersonalCalendar(calendar.id, calendar.summary);
                        
                        return {
                            found: true,
                            calendarId: calendar.id,
                            calendarName: calendar.summary,
                            isPersonal: isPersonal,
                            event: event.data
                        };
                    }
                } catch (error) {
                    // Continue searching in other calendars
                    continue;
                }
            }

            return { found: false };
        } catch (error) {
            console.error(`Error searching for event ${eventId}:`, error);
            return { found: false, error: error.message };
        }
    }

    async processJobAutoDetection(job) {
        try {
            const { job_id, team, eventId, calendar_event_id, status } = job;
            
            // Use eventId or calendar_event_id (for backward compatibility)
            const calendarEventId = eventId || calendar_event_id;
            
            // Only process jobs with calendar events
            if (!calendarEventId || !team) {
                return { processed: false, reason: 'No calendar event or team specified' };
            }

            // Get queue calendar ID for team
            const queueCalendarId = this.queueCalendars[team];
            if (!queueCalendarId) {
                return { processed: false, reason: `No queue calendar configured for team: ${team}` };
            }

            // Check if event was moved
            const moveResult = await this.checkEventMoved(job_id, calendarEventId, queueCalendarId);
            
            if (moveResult.moved && moveResult.newCalendarId) {
                // Event was moved to another calendar - assume it's handled by technician
                await this.updateJobStatus(job_id, 'นัดหมายเรียบร้อยแล้ว', {
                    auto_detection: true,
                    moved_from_queue: true,
                    moved_to_calendar: moveResult.newCalendarName,
                    detection_time: new Date().toISOString()
                });

                return {
                    processed: true,
                    action: 'status_updated',
                    newStatus: 'นัดหมายเรียบร้อยแล้ว',
                    reason: `Event moved to calendar: ${moveResult.newCalendarName}`
                };
            } else if (moveResult.deletedFromQueue && !moveResult.moved) {
                // Event disappeared from queue calendar (moved/deleted/missing)
                // Cannot distinguish between "moved" vs "deleted" - assume moved = completed
                await this.updateJobStatus(job_id, 'นัดหมายเรียบร้อยแล้ว', {
                    auto_detection: true,
                    disappeared_from_queue: true,
                    detection_time: new Date().toISOString()
                });

                return {
                    processed: true,
                    action: 'status_updated',
                    newStatus: 'นัดหมายเรียบร้อยแล้ว',
                    reason: 'Event disappeared from queue calendar - assumed completed by technician'
                };
            }

            return { processed: false, reason: 'No changes detected' };

        } catch (error) {
            console.error(`Error processing auto-detection for job ${job.job_id}:`, error);
            return { processed: false, error: error.message };
        }
    }

    async updateJobStatus(jobId, newStatus, metadata = {}) {
        try {
            const jobs = await this.sheets.getAllJobs();
            const jobIndex = jobs.findIndex(job => job.job_id === jobId);
            
            if (jobIndex === -1) {
                throw new Error(`Job ${jobId} not found`);
            }

            // Update job status
            await this.sheets.updateJobStatus(jobId, newStatus);

            // Log the auto-detection action
            console.log(`Auto-Detection: Updated job ${jobId} status to "${newStatus}"`, metadata);

            return true;
        } catch (error) {
            console.error(`Error updating job status for ${jobId}:`, error);
            throw error;
        }
    }

    async runDailyAutoDetection() {
        try {
            console.log('🔍 Starting daily auto-detection check at', new Date().toISOString());
            console.log('📋 Logic: Event missing from queue calendar → นัดหมายเรียบร้อยแล้ว (regardless of reason)');
            console.log('🌐 Manual deletion via web app → Cancelled (handled separately)');

            // Initialize authentication
            const authSuccess = await this.initializeAuth();
            if (!authSuccess) {
                throw new Error('Failed to initialize authentication');
            }

            // Get all active jobs with calendar events
            const jobs = await this.sheets.getAllJobs();
            const jobsWithCalendar = jobs.filter(job => 
                (job.eventId || job.calendar_event_id) && 
                job.team && 
                !['Completed', 'Cancelled', 'นัดหมายเรียบร้อยแล้ว'].includes(job.status)
            );

            console.log(`📅 Found ${jobsWithCalendar.length} jobs with calendar events to check`);

            const results = {
                totalChecked: jobsWithCalendar.length,
                statusUpdated: 0,
                moved: 0,
                deleted: 0,
                errors: 0,
                details: []
            };

            // Process each job
            for (const job of jobsWithCalendar) {
                try {
                    const result = await this.processJobAutoDetection(job);
                    
                    if (result.processed) {
                        if (result.action === 'status_updated') {
                            results.statusUpdated++;
                            
                            if (result.newStatus === 'นัดหมายเรียบร้อยแล้ว') {
                                results.moved++;
                            } else if (result.newStatus === 'Cancelled') {
                                results.deleted++;
                            }
                        }
                    }

                    results.details.push({
                        jobId: job.job_id,
                        result: result
                    });

                } catch (error) {
                    results.errors++;
                    results.details.push({
                        jobId: job.job_id,
                        error: error.message
                    });
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('Daily auto-detection completed:', results);
            return results;

        } catch (error) {
            console.error('Error running daily auto-detection:', error);
            throw error;
        }
    }

    async checkSpecificJob(jobId) {
        try {
            // Initialize authentication
            const authSuccess = await this.initializeAuth();
            if (!authSuccess) {
                throw new Error('Failed to initialize authentication');
            }

            // Get specific job
            const jobs = await this.sheets.getAllJobs();
            const job = jobs.find(j => j.job_id === jobId);
            
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }

            return await this.processJobAutoDetection(job);

        } catch (error) {
            console.error(`Error checking specific job ${jobId}:`, error);
            throw error;
        }
    }
}

module.exports = new AutoDetectionService();