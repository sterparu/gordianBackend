"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailWorker = exports.emailQueue = void 0;
const bullmq_1 = require("bullmq");
const EmailService_1 = require("../services/EmailService");
const ioredis_1 = __importDefault(require("ioredis"));
const connection = new ioredis_1.default({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});
exports.emailQueue = new bullmq_1.Queue('email-sending', { connection });
const emailService = EmailService_1.EmailService.getInstance();
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
exports.emailWorker = new bullmq_1.Worker('email-sending', async (job) => {
    // Check if this is a campaign job
    if (job.name === 'send-campaign') {
        const { recipients, subject, html, ...config } = job.data;
        const total = recipients.length;
        console.log(`Processing campaign ${job.id} for ${total} recipients.`);
        let successCount = 0;
        let failureCount = 0;
        const failedEmails = [];
        if (total < 1000) {
            // Case 1: Under 1000 emails - Loop with 300ms delay
            for (let i = 0; i < total; i++) {
                const recipient = recipients[i];
                try {
                    await emailService.sendEmail({ to: recipient, subject, html, ...config });
                    successCount++;
                }
                catch (err) {
                    console.error(`Failed to send to ${recipient}:`, err.message);
                    failureCount++;
                    failedEmails.push({ email: recipient, error: err.message });
                }
                // Update progress: (current index + 1) out of total
                if (job)
                    await job.updateProgress({ sent: i + 1, total });
                await wait(300);
            }
        }
        else {
            // Case 2: Over 1000 emails - Batches of 50 with delays
            const BATCH_SIZE = 50;
            let sentCount = 0;
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = recipients.slice(i, i + BATCH_SIZE);
                console.log(`Processing batch ${i / BATCH_SIZE + 1} (${batch.length} emails)`);
                for (const recipient of batch) {
                    try {
                        await emailService.sendEmail({ to: recipient, subject, html, ...config });
                        successCount++;
                    }
                    catch (err) {
                        console.error(`Failed to send to ${recipient}:`, err.message);
                        failureCount++;
                        failedEmails.push({ email: recipient, error: err.message });
                    }
                    sentCount++;
                    await wait(300);
                }
                // Update progress after batch
                if (job)
                    await job.updateProgress({ sent: sentCount, total });
                // If there are more recipients, wait 2 seconds between batches
                if (i + BATCH_SIZE < total) {
                    await wait(2000);
                }
            }
        }
        console.log(`Campaign ${job.id} sending completed.`);
        return { successCount, failureCount, failedEmails };
    }
    else {
        // Legacy/Single email support
        console.log(`Processing single job ${job.id} for ${job.data.to}`);
        await emailService.sendEmail(job.data);
        return { successCount: 1, failureCount: 0, failedEmails: [] };
    }
}, { connection });
