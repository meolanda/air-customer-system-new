const cron = require('node-cron');
const autoDetection = require('./autoDetection');

class SchedulerService {
    constructor() {
        this.jobs = new Map();
        this.timezone = process.env.TIMEZONE || 'Asia/Bangkok';
    }

    startDailyAutoDetection() {
        // Schedule daily check at 10:00 AM Bangkok time
        const cronExpression = '0 10 * * *'; // 10:00 AM every day
        
        console.log(`Scheduling daily auto-detection at 10:00 AM (${this.timezone})`);
        
        const task = cron.schedule(cronExpression, async () => {
            try {
                console.log('\n=== DAILY AUTO-DETECTION STARTED ===');
                console.log('Time:', new Date().toLocaleString('th-TH', { timeZone: this.timezone }));
                
                const results = await autoDetection.runDailyAutoDetection();
                
                console.log('\n=== DAILY AUTO-DETECTION RESULTS ===');
                console.log(`Total jobs checked: ${results.totalChecked}`);
                console.log(`Status updated: ${results.statusUpdated}`);
                console.log(`Moved to personal: ${results.moved}`);
                console.log(`Deleted/Cancelled: ${results.deleted}`);
                console.log(`Errors: ${results.errors}`);
                
                if (results.statusUpdated > 0) {
                    console.log('\nUpdated jobs:');
                    results.details
                        .filter(d => d.result?.processed && d.result?.action === 'status_updated')
                        .forEach(d => {
                            console.log(`- ${d.jobId}: ${d.result.reason}`);
                        });
                }
                
                console.log('=== DAILY AUTO-DETECTION COMPLETED ===\n');
                
            } catch (error) {
                console.error('Daily auto-detection failed:', error);
            }
        }, {
            scheduled: false,
            timezone: this.timezone
        });

        this.jobs.set('dailyAutoDetection', task);
        task.start();
        
        console.log('Daily auto-detection scheduler started successfully');
        return task;
    }

    stopDailyAutoDetection() {
        const task = this.jobs.get('dailyAutoDetection');
        if (task) {
            task.stop();
            this.jobs.delete('dailyAutoDetection');
            console.log('Daily auto-detection scheduler stopped');
            return true;
        }
        return false;
    }

    async runImmediateCheck() {
        try {
            console.log('Running immediate auto-detection check...');
            const results = await autoDetection.runDailyAutoDetection();
            console.log('Immediate check completed:', results);
            return results;
        } catch (error) {
            console.error('Immediate check failed:', error);
            throw error;
        }
    }

    getSchedulerStatus() {
        return {
            timezone: this.timezone,
            activeJobs: Array.from(this.jobs.keys()),
            dailyAutoDetectionActive: this.jobs.has('dailyAutoDetection'),
            nextRun: this.jobs.has('dailyAutoDetection') ? 
                'Daily at 10:00 AM Bangkok time' : 'Not scheduled'
        };
    }

    startAllSchedulers() {
        console.log('Starting all schedulers...');
        this.startDailyAutoDetection();
        console.log('All schedulers started');
    }

    stopAllSchedulers() {
        console.log('Stopping all schedulers...');
        this.jobs.forEach((task, name) => {
            task.stop();
            console.log(`Stopped scheduler: ${name}`);
        });
        this.jobs.clear();
        console.log('All schedulers stopped');
    }
}

module.exports = new SchedulerService();