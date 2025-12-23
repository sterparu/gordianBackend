"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const EmailService_1 = require("../services/EmailService");
const emailQueue_1 = require("../queues/emailQueue");
const router = (0, express_1.Router)();
const emailService = EmailService_1.EmailService.getInstance();
const supabase_1 = require("../db/supabase");
// Helper to get settings
const getEmailSettings = async () => {
    const { data, error } = await supabase_1.supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .single();
    if (error || !data) {
        throw new Error('Email configuration not found. Please configure settings first.');
    }
    return data;
};
router.post('/send', async (req, res) => {
    try {
        const { to, subject, html, type } = req.body;
        // 1. Fetch settings from DB
        const settings = await getEmailSettings();
        // 2. Prepare config object
        const emailConfig = {
            provider: settings.provider,
            from: `${settings.from_name} <${settings.from_email}>`,
            replyTo: settings.reply_to_email,
            smtpConfig: settings.provider === 'smtp' ? {
                host: settings.smtp_host,
                port: settings.smtp_port,
                secure: settings.smtp_port === 465, // Auto-detect secure
                auth: {
                    user: settings.smtp_user,
                    pass: settings.smtp_pass
                }
            } : undefined,
            sesConfig: settings.provider === 'custom-ses' ? {
                region: settings.aws_region,
                accessKeyId: settings.aws_access_key,
                secretAccessKey: settings.aws_secret_key
            } : undefined
        };
        // New Step: Validate configuration BEFORE queuing or sending
        // This throws if the provider (e.g. shared-ses) is misconfigured on the server
        emailService.validateConfiguration({ to: '', subject: '', html: '', ...emailConfig });
        if (type === 'bulk') {
            let recipients = Array.isArray(to) ? to : [to];
            // If recipients are strings, convert to objects (legacy support)
            // If they are objects, they might contain { email, attachments }
            recipients = recipients.map((r) => {
                if (typeof r === 'string') {
                    return { email: r, attachments: [] }; // Normal string email
                }
                return r; // Already object { email, attachments }
            });
            const job = await emailQueue_1.emailQueue.add('send-campaign', {
                recipients, // Now always an array of objects
                subject,
                html,
                ...emailConfig
            });
            return res.json({
                message: `Queued campaign for ${recipients.length} recipients via ${settings.provider}`,
                jobId: job.id
            });
        }
        // Direct send
        await emailService.sendEmail({
            to,
            subject,
            html,
            ...emailConfig
        });
        res.json({ message: 'Email sent successfully' });
    }
    catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: error.message });
    }
});
router.post('/send-test', async (req, res) => {
    try {
        const { to, subject, html } = req.body;
        const settings = await getEmailSettings();
        await emailService.sendEmail({
            to,
            subject,
            html,
            provider: settings.provider,
            from: `${settings.from_name} <${settings.from_email}>`,
            replyTo: settings.reply_to_email,
            smtpConfig: settings.provider === 'smtp' ? {
                host: settings.smtp_host,
                port: settings.smtp_port,
                secure: settings.smtp_port === 465,
                auth: {
                    user: settings.smtp_user,
                    pass: settings.smtp_pass
                }
            } : undefined,
            sesConfig: settings.provider === 'custom-ses' ? {
                region: settings.aws_region,
                accessKeyId: settings.aws_access_key,
                secretAccessKey: settings.aws_secret_key
            } : undefined
        });
        res.json({ message: `Test email sent via ${settings.provider}` });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/verify-identity', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email)
            throw new Error('Email is required');
        await emailService.verifyEmailIdentity(email);
        res.json({ message: `Verification email sent to ${email}` });
    }
    catch (error) {
        console.error('Error verifying identity:', error);
        res.status(500).json({ error: error.message });
    }
});
router.post('/check-identity-status', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email)
            throw new Error('Email is required');
        const status = await emailService.checkEmailIdentityStatus(email);
        res.json({ status });
    }
    catch (error) {
        console.error('Error checking identity status:', error);
        res.status(500).json({ error: error.message });
    }
});
router.get('/status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const job = await emailQueue_1.emailQueue.getJob(id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        const state = await job.getState();
        const progress = job.progress;
        // Get return value if job is completed
        const result = await job.returnvalue;
        res.json({
            id: job.id,
            state,
            progress,
            result
        });
    }
    catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
