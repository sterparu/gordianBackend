"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailWorker = exports.emailQueue = void 0;
const bullmq_1 = require("bullmq");
const EmailService_1 = require("../services/EmailService");
const ioredis_1 = __importDefault(require("ioredis"));
console.log(`Initializing BullMQ with Redis URL: ${!!process.env.REDIS_URL}`);
const connection = process.env.REDIS_URL
    ? new ioredis_1.default(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new ioredis_1.default({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null,
    });
exports.emailQueue = new bullmq_1.Queue('email-sending', { connection });
const emailService = EmailService_1.EmailService.getInstance();
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const supabase_1 = require("../db/supabase");
exports.emailWorker = new bullmq_1.Worker('email-sending', async (job) => {
    // Check if this is a campaign job
    if (job.name === 'send-campaign') {
        const { recipients, subject, html, campaignId, ...config } = job.data;
        const total = recipients.length;
        console.log(`Processing campaign ${job.id} for ${total} recipients.`);
        let successCount = 0;
        let failureCount = 0;
        const failedEmails = [];
        // Helper to update log
        const updateLog = async (recipient, status, error) => {
            if (!campaignId)
                return;
            // Use trackingId if available for precise lookup, else email
            const trackingId = recipient.trackingId;
            if (trackingId) {
                await supabase_1.supabase.from('email_logs')
                    .update({
                    status,
                    error_message: error || null
                })
                    .eq('tracking_id', trackingId);
            }
            else {
                // Fallback for legacy
                const email = typeof recipient === 'string' ? recipient : recipient.email;
                await supabase_1.supabase.from('email_logs')
                    .update({
                    status,
                    error_message: error || null
                })
                    .eq('campaign_id', campaignId)
                    .eq('recipient_email', email);
            }
        };
        const processRecipient = async (recipient) => {
            const emailAddress = typeof recipient === 'string' ? recipient : recipient.email;
            // Extract trackingId if it exists
            const trackingId = typeof recipient === 'object' ? recipient.trackingId : undefined;
            try {
                await emailService.sendEmail({
                    to: recipient,
                    subject,
                    html,
                    trackingId, // Explicitly pass trackingId 
                    ...config
                });
                successCount++;
                await updateLog(recipient, 'sent');
            }
            catch (err) {
                console.error(`Failed to send to ${emailAddress}:`, err.message);
                failureCount++;
                failedEmails.push({ email: emailAddress, error: err.message });
                await updateLog(recipient, 'failed', err.message);
                // Auto-Blacklist Logic
                const isPermanentError = (msg) => {
                    const lower = msg.toLowerCase();
                    return lower.includes('550') ||
                        lower.includes('user unknown') ||
                        lower.includes('does not exist') ||
                        lower.includes('rejected') ||
                        lower.includes('blacklisted') ||
                        lower.includes('suppression list');
                };
                if (isPermanentError(err.message)) {
                    console.log(`Auto-blacklisting ${emailAddress} due to permanent error: ${err.message}`);
                    const { error } = await supabase_1.supabase.from('blacklist').insert({
                        email: emailAddress,
                        reason: `Auto-Bounced: ${err.message}`
                    });
                    if (error && error.code !== '23505') {
                        console.error('Failed to auto-blacklist:', error);
                    }
                }
            }
        };
        if (total < 1000) {
            // Case 1: Under 1000 emails - Loop with 300ms delay
            for (let i = 0; i < total; i++) {
                const recipient = recipients[i];
                await processRecipient(recipient);
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
                    await processRecipient(recipient);
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
        // Mark campaign as completed
        if (campaignId) {
            await supabase_1.supabase.from('campaigns')
                .update({ status: 'completed' })
                .eq('id', campaignId);
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
