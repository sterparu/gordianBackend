import { Queue, Worker } from 'bullmq';
import { EmailService } from '../services/EmailService';
import IORedis from 'ioredis';

console.log(`Initializing BullMQ with Redis URL: ${!!process.env.REDIS_URL}`);

const connection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null,
    });

export const emailQueue = new Queue('email-sending', { connection });

const emailService = EmailService.getInstance();

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import { supabase } from '../db/supabase';

export const emailWorker = new Worker('email-sending', async (job) => {
    // Check if this is a campaign job
    if (job.name === 'send-campaign') {
        const { recipients, subject, html, campaignId, ...config } = job.data;
        const total = recipients.length;
        console.log(`Processing campaign ${job.id} for ${total} recipients.`);

        let successCount = 0;
        let failureCount = 0;
        const failedEmails: { email: string; error: string }[] = [];

        // Helper to update log
        const updateLog = async (recipient: any, status: 'sent' | 'failed', error?: string) => {
            if (!campaignId) return;
            // Use trackingId if available for precise lookup, else email
            const trackingId = recipient.trackingId;

            if (trackingId) {
                await supabase.from('email_logs')
                    .update({
                        status,
                        error_message: error || null
                    })
                    .eq('tracking_id', trackingId);
            } else {
                // Fallback for legacy
                const email = typeof recipient === 'string' ? recipient : recipient.email;
                await supabase.from('email_logs')
                    .update({
                        status,
                        error_message: error || null
                    })
                    .eq('campaign_id', campaignId)
                    .eq('recipient_email', email);
            }
        };

        const processRecipient = async (recipient: any) => {
            const emailAddress = typeof recipient === 'string' ? recipient : recipient.email;
            // Extract trackingId if it exists
            const trackingId = typeof recipient === 'object' ? recipient.trackingId : undefined;

            try {
                // Perform Variable Substitution
                let personalizedHtml = html;
                const rowData = typeof recipient === 'object' ? recipient.data : null;

                if (rowData) {
                    // Escape Regex Helper
                    const escapeRegExp = (string: string) => {
                        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    };

                    Object.keys(rowData).forEach(key => {
                        // We match {{key}}
                        const safeKey = escapeRegExp(key);
                        const value = rowData[key] || '';
                        personalizedHtml = personalizedHtml.replace(new RegExp(`{{${safeKey}}}`, 'g'), String(value));
                    });
                }

                await emailService.sendEmail({
                    to: recipient,
                    subject,
                    html: personalizedHtml,
                    trackingId, // Explicitly pass trackingId 
                    ...config
                });
                successCount++;
                await updateLog(recipient, 'sent');
            } catch (err: any) {
                console.error(`Failed to send to ${emailAddress}:`, err.message);
                failureCount++;
                failedEmails.push({ email: emailAddress, error: err.message });
                await updateLog(recipient, 'failed', err.message);

                // Auto-Blacklist Logic
                const isPermanentError = (msg: string) => {
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
                    const { error } = await supabase.from('blacklist').insert({
                        email: emailAddress,
                        reason: `Auto-Bounced: ${err.message}`,
                        user_id: campaignId ? (await supabase.from('campaigns').select('user_id').eq('id', campaignId).single()).data?.user_id : undefined,
                        source: 'bounce'
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
                if (job) await job.updateProgress({ sent: i + 1, total });
                await wait(300);
            }
        } else {
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
                if (job) await job.updateProgress({ sent: sentCount, total });

                // If there are more recipients, wait 2 seconds between batches
                if (i + BATCH_SIZE < total) {
                    await wait(2000);
                }
            }
        }

        // Mark campaign as completed
        if (campaignId) {
            await supabase.from('campaigns')
                .update({ status: 'completed' })
                .eq('id', campaignId);
        }

        console.log(`Campaign ${job.id} sending completed.`);
        return { successCount, failureCount, failedEmails };
    } else {
        // Legacy/Single email support
        console.log(`Processing single job ${job.id} for ${job.data.to}`);
        await emailService.sendEmail(job.data);
        return { successCount: 1, failureCount: 0, failedEmails: [] };
    }
}, { connection });
