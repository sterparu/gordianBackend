import nodemailer from 'nodemailer';
import * as aws from '@aws-sdk/client-ses';
import { SESClient } from '@aws-sdk/client-ses';

interface EmailPayload {
    to: string | { email: string; attachments?: { name: string; url: string }[] };
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
    trackingId?: string; // New: Tracking Pixel ID
    provider?: 'shared-ses' | 'custom-ses' | 'smtp';
    smtpConfig?: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string;
            pass: string;
        };
    };
    sesConfig?: {
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
    };
}

export class EmailService {
    private static instance: EmailService;
    private sharedSesClient: SESClient | null = null;
    private sharedSesTransporter: nodemailer.Transporter | null = null;
    private baseUrl: string = process.env.BASE_URL || 'http://localhost:4000'; // Default to localhost

    private constructor() {
        // Initialize Shared SES if env vars are present
        if (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID) {
            this.sharedSesClient = new SESClient({
                apiVersion: '2010-12-01',
                region: process.env.AWS_REGION,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
                }
            });

            this.sharedSesTransporter = nodemailer.createTransport({
                SES: { ses: this.sharedSesClient, aws },
            } as any);
        }
    }

    public static getInstance(): EmailService {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }

    public async sendEmail(payload: EmailPayload): Promise<void> {
        // Validation logic can remain simple or expanded
        // this.validateConfiguration(payload);

        let transporter: nodemailer.Transporter;

        // Determine recipient and attachments
        const recipientEmail = typeof payload.to === 'string' ? payload.to : payload.to.email;
        const attachments = (typeof payload.to === 'object' && payload.to.attachments) ? payload.to.attachments : [];

        // Map to Nodemailer attachment format
        const nodemailerAttachments = attachments.map(att => ({
            filename: att.name,
            path: att.url
        }));

        // Inject Tracking Pixel & Unsubscribe Link if ID provided
        let emailHtml = payload.html;
        if (payload.trackingId) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const unsubscribeLink = `<br/><br/><p style="text-align:center; color:#9fa6b2; font-size:12px; font-family:sans-serif;">Don't want these emails? <a href="${frontendUrl}/unsubscribe?id=${payload.trackingId}" style="color:#9fa6b2; text-decoration:underline;">Unsubscribe</a></p>`;

            const trackingPixel = `<img src="${this.baseUrl}/api/analytics/track/${payload.trackingId}" width="1" height="1" style="display:none;" alt="" />`;

            // Append to body end if exists, else append to end of string
            const injection = `${unsubscribeLink}${trackingPixel}`;

            if (emailHtml.includes('</body>')) {
                emailHtml = emailHtml.replace('</body>', `${injection}</body>`);
            } else {
                emailHtml += injection;
            }
        }

        if (payload.provider === 'smtp' && payload.smtpConfig) {
            transporter = nodemailer.createTransport(payload.smtpConfig);
        } else if (payload.provider === 'custom-ses' && payload.sesConfig) {
            const ses = new SESClient({
                apiVersion: '2010-12-01',
                region: payload.sesConfig.region,
                credentials: {
                    accessKeyId: payload.sesConfig.accessKeyId!,
                    secretAccessKey: payload.sesConfig.secretAccessKey!,
                }
            });
            transporter = nodemailer.createTransport({
                SES: { ses, aws },
            } as any);
        } else {
            // Default to Shared SES
            if (!this.sharedSesTransporter) {
                throw new Error('Shared SES is not configured on the server. Please check environment variables.');
            }
            transporter = this.sharedSesTransporter;
        }

        await transporter.sendMail({
            from: payload.from || process.env.DEFAULT_FROM_EMAIL || 'noreply@toolmail.com',
            to: recipientEmail,
            subject: payload.subject,
            html: emailHtml, // Use injected HTML
            replyTo: payload.replyTo,
            attachments: nodemailerAttachments.length > 0 ? nodemailerAttachments : undefined
        });
    }

    public validateConfiguration(options: any): void { // relaxed type to any to match usage in routes
        if (options.provider === 'shared-ses') {
            if (!this.sharedSesTransporter) {
                throw new Error('Shared SES is not configured on the server (missing env vars). Please configure a Custom Provider in Settings.');
            }
        }
        // Could add basic SMTP validation here too if needed, but connection verify is slow.
    }

    public async verifyEmailIdentity(email: string): Promise<void> {
        if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID) {
            throw new Error('Server SES credentials are not configured.');
        }

        const ses = new SESClient({
            apiVersion: '2010-12-01',
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            }
        });

        // Dynamically import command to avoid top-level issues if any
        const { VerifyEmailIdentityCommand } = await import('@aws-sdk/client-ses');
        await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
    }

    public async verifySMTP(config: any): Promise<boolean> {
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        });

        try {
            await transporter.verify();
            return true;
        } catch (error) {
            console.error('SMTP Verification Error:', error);
            throw error;
        }
    }

    public async checkEmailIdentityStatus(email: string): Promise<string> {
        if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID) {
            throw new Error('Server SES credentials are not configured.');
        }

        const ses = new SESClient({
            apiVersion: '2010-12-01',
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            }
        });

        const { GetIdentityVerificationAttributesCommand } = await import('@aws-sdk/client-ses');
        const response = await ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [email] }));
        const attributes = response.VerificationAttributes?.[email];

        return attributes?.VerificationStatus || 'NotFound';
    }
}

