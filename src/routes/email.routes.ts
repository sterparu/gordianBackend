
import { Router } from 'express';
import { EmailService } from '../services/EmailService';
import { emailQueue } from '../queues/emailQueue';

const router = Router();
const emailService = EmailService.getInstance();

import { supabase } from '../db/supabase';

// Helper to get settings for a specific user
const getEmailSettings = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error('Email configuration not found. Please ensure you are logged in and settings are created.');
  }
  return data;
};

// Helper: Check for monthly renewal and deduct credits
const checkAndRenewBalance = async (settings: any) => {
  const now = new Date();
  const lastRenewed = new Date(settings.last_renewed || 0); // Handle null
  const oneMonth = 30 * 24 * 60 * 60 * 1000; // 30 days approx

  // 1. Check if renewal is needed
  if (now.getTime() - lastRenewed.getTime() > oneMonth) {
    console.log('Renewing email credits...');
    const { data, error } = await supabase
      .from('user_settings')
      .update({
        remaining_credits: settings.monthly_limit,
        last_renewed: now
      })
      .eq('id', settings.id)
      .select()
      .single();

    if (error) throw error;
    return data; // Return updated settings
  }

  return settings;
};

// Helper: Deduct credits
const deductCredits = async (userId: string, amount: number) => {
  // We use a raw SQL query equivalent or simple read-update because Supabase JS simpler RPC might not be set up
  // Ideally we use a stored procedure for atomicity, but for now we read-then-update (optimistic locking could be better but keeping simple)
  // Actually, we can just use the decrement approach if we knew the current value, 
  // but better to rely on the value we already have or re-fetch.

  // Simplest approach: supabase.rpc('decrement_credits', { count: amount }) // Assuming we made an RPC
  // Since we didn't make an RPC, we will fetch fresh and update.

  const { data: current } = await supabase.from('user_settings').select('remaining_credits').eq('id', userId).single();
  if (!current) throw new Error('User not found');

  const newBalance = current.remaining_credits - amount;

  const { error } = await supabase
    .from('user_settings')
    .update({ remaining_credits: newBalance })
    .eq('id', userId);

  if (error) throw error;
  if (error) throw error;
};

// Helper: Blacklist Filter
const filterBlacklisted = async (recipients: any[], userId: string) => {
  // 1. Fetch user's blacklist
  const { data: blacklist, error } = await supabase
    .from('blacklist')
    .select('email')
    .eq('user_id', userId);

  if (error || !blacklist) return recipients;

  const blockedEmails = new Set(blacklist.map(b => b.email.toLowerCase()));

  // 2. Filter
  return recipients.filter(r => {
    const email = typeof r === 'string' ? r : r.email;
    return !blockedEmails.has(email.toLowerCase());
  });
};

router.post('/send', async (req, res) => {
  try {
    const { to, subject, html, type } = req.body;

    // 0. Pre-process Recipients & Check Blacklist
    let rawRecipients = Array.isArray(to) ? to : [to];
    const initialCount = rawRecipients.length;

    // Filter out blacklisted emails
    const validRecipients = await filterBlacklisted(rawRecipients, req.user.id);
    const blockedCount = initialCount - validRecipients.length;

    if (validRecipients.length === 0) {
      return res.status(400).json({
        error: 'All recipients are blacklisted.',
        blockedCount
      });
    }

    // 0.5 Check User (attached by authMiddleware)
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 1. Fetch settings from DB for THIS user
    let settings = await getEmailSettings(req.user.id);

    // 2. Renewal Check
    settings = await checkAndRenewBalance(settings);

    // 3. Count Recipients
    let recipientCount = 0;
    if (type === 'bulk') {
      recipientCount = validRecipients.length;
    } else {
      recipientCount = 1; // Single email / Test
    }

    // 4. Validate Credits
    if (settings.remaining_credits < recipientCount) {
      return res.status(403).json({
        error: `Insufficient credits. You have ${settings.remaining_credits} credits left, but tried to send to ${recipientCount} recipients.`
      });
    }

    // 5. Deduct Credits IMMEDIATELY (reservation)
    await deductCredits(settings.id, recipientCount);

    // 6. Create Campaign Record
    // Always create a campaign, even for single sends, to ensure tracking/unsubscribe works.
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: subject,
        subject: subject,
        body: html, // Save email content for analytics
        total_recipients: recipientCount,
        status: 'processing',
        user_id: req.user.id
      })
      .select()
      .single();

    if (campaignError) throw campaignError;
    const campaignId = campaign.id;

    // 7. Prepare config object
    const emailConfig = {
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
    };

    emailService.validateConfiguration({ to: '', subject: '', html: '', ...emailConfig } as any);

    // Prepare recipients with tracking IDs for Queue AND Database Log
    const recipientsWithTracking = validRecipients.map((r: any) => {
      // Standardize input
      const email = typeof r === 'string' ? r : r.email;
      const attachments = typeof r === 'string' ? [] : (r.attachments || []);
      const rowData = typeof r === 'string' ? {} : (r.data || {});

      return {
        email,
        attachments,
        data: rowData,
        trackingId: crypto.randomUUID() // Generate unique ID of tracking pixel
      };
    });

    // Bulk Insert Logs
    const logs = recipientsWithTracking.map(r => ({
      campaign_id: campaignId,
      recipient_email: r.email,
      status: 'pending',
      tracking_id: r.trackingId
    }));

    const { error: logError } = await supabase.from('email_logs').insert(logs);
    if (logError) console.error('Failed to insert email logs:', logError);

    // Add to Queue
    const job = await emailQueue.add('send-campaign', {
      recipients: recipientsWithTracking,
      subject,
      html,
      campaignId,
      ...emailConfig
    });

    return res.json({
      message: `Queued campaign for ${recipientCount} recipients.`,
      jobId: job.id,
      campaignId,
      blockedCount: blockedCount > 0 ? blockedCount : undefined
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-test', async (req, res) => {
  try {
    const { to, subject, html } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const settings = await getEmailSettings(req.user.id);

    await emailService.sendEmail({
      to,
      subject,
      html,
      trackingId: 'test-email-no-tracking', // Dummy ID to trigger footer injection
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-identity', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) throw new Error('Email is required');

    await emailService.verifyEmailIdentity(email);
    res.json({ message: `Verification email sent to ${email}` });
  } catch (error: any) {
    console.error('Error verifying identity:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-smtp', async (req, res) => {
  try {
    const config = req.body;

    // Validate required fields
    if (!config.host || !config.port || !config.user || !config.pass) {
      return res.status(400).json({ error: 'Missing SMTP configuration fields' });
    }

    const isValid = await emailService.verifySMTP({
      host: config.host,
      port: Number(config.port),
      user: config.user,
      pass: config.pass
    });

    if (isValid) {
      res.json({ message: 'SMTP Connection Successful' });
    } else {
      res.status(400).json({ error: 'Failed to verify SMTP connection' });
    }
  } catch (error: any) {
    console.error('SMTP Test Error:', error);
    res.status(400).json({ error: error.message || 'SMTP Connection Failed' });
  }
});

router.post('/check-identity-status', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) throw new Error('Email is required');

    const status = await emailService.checkEmailIdentityStatus(email);
    res.json({ status });
  } catch (error: any) {
    console.error('Error checking identity status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await emailQueue.getJob(id);

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
  } catch (error: any) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

