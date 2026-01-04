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
    private baseUrl: string = process.env.BASE_URL || 'https://app.vasteris.com'; // Default to production URL

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
            const frontendUrl = process.env.FRONTEND_URL || 'https://app.vasteris.com';

            // Extract Sender Name for footer
            let senderName = 'Expeditorului';
            if (payload.from) {
                const match = payload.from.match(/^(.*)<.*>$/);
                if (match) {
                    senderName = match[1].trim().replace(/^["']|["']$/g, '');
                } else if (!payload.from.includes('@')) {
                    senderName = payload.from;
                } else {
                    senderName = payload.from; // Fallback to email if no name part
                }
            }

            const unsubscribeLink = `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
    <tr>
        <td style="font-family: sans-serif; font-size: 12px; color: #4a5568;">
            <strong>De ce am primit acest e-mail?</strong><br />
            Primiți acest mesaj deoarece sunteți înregistrat în baza de date a <strong>${senderName}</strong> pentru comunicări financiare și facturare.
            <br /><br />
            <strong>Informații Expeditor:</strong><br />
            weCodeTou SRL | CIF: 48187338 | Reg. Com: J23/9284/2023<br />
            Adresă: Str. Padurea Craiului Nr. 78B, Sat Berceni, Jud. Ilfov, 077020<br />
            Suport: <a href="mailto:support@vasteris.com" style="color: #4c51bf;">support@vasteris.com</a>
        </td>
    </tr>
    <tr>
        <td style="padding-top: 20px; font-family: sans-serif; font-size: 11px; color: #a0aec0; text-align: center;">
            <a href="${frontendUrl}/unsubscribe?id=${payload.trackingId}" style="color: #a0aec0; text-decoration: underline;">Dezabonare</a> | 
            <a href="https://vasteris.com/privacy" style="color: #a0aec0; text-decoration: underline;">Politică Confidențialitate</a>
        </td>
    </tr>
</table>`;

            // Tracking removed per user request
            // const trackingPixel = `<img src="${this.baseUrl}/api/analytics/track/${payload.trackingId}" width="1" height="1" style="display:none;" alt="" />`;

            // Append to body end if exists, else append to end of string
            const injection = `${unsubscribeLink}`; // Removed trackingPixel

            if (emailHtml.includes('</body>')) {
                emailHtml = emailHtml.replace('</body>', `${injection}</body>`);
            } else {
                emailHtml += injection;
            }
        }

        if (payload.provider === 'smtp' && payload.smtpConfig) {
            transporter = nodemailer.createTransport({
                ...payload.smtpConfig,
                port: Number(payload.smtpConfig.port), // Ensure port is number
                // Add timeouts to prevent hanging indefinitely (default is very long)
                connectionTimeout: 30000, // 30 seconds
                greetingTimeout: 30000,   // 30 seconds
                socketTimeout: 30000,     // 30 seconds

                // Force IPv4 to avoid IPv6 timeouts (common with Gmail)
                family: 4,

                // Improve compatibility with older/self-signed servers
                tls: {
                    rejectUnauthorized: false
                }
            } as any);
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

        // Ensure HTML is wrapped in <html><body> tags
        if (!emailHtml.includes('<html') && !emailHtml.includes('<body')) {
            emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif;">
${emailHtml}
</body>
</html>`;
        }

        // Generate Plain Text version
        const textContent = this.generatePlainText(emailHtml);

        // Add headers (List-Unsubscribe)
        const headers: any = {};
        if (payload.trackingId) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const unsubscribeUrl = `${frontendUrl}/unsubscribe?id=${payload.trackingId}`;
            headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
        }

        // Fix for FREEMAIL_FORGED_REPLYTO strategy
        // If Reply-To is a freemail (gmail, yahoo, etc) and From is likely custom, 
        // using the freemail reply-to hurts spam score significantly (-2.5).
        // Per user report: "scoate de tot câmpul Reply-To".
        let finalReplyTo = payload.replyTo;
        if (finalReplyTo && (finalReplyTo.includes('@gmail.com') || finalReplyTo.includes('@yahoo.com') || finalReplyTo.includes('@hotmail.com'))) {
            // Check if From is NOT a freemail (simple check)
            const fromEmail = typeof payload.from === 'string' ? payload.from : '';
            if (fromEmail && !fromEmail.includes('@gmail.com') && !fromEmail.includes('@yahoo.com') && !fromEmail.includes('@hotmail.com')) {
                // Mismatch detected: Custom Domain sending -> Freemail Reply-To. 
                // Remove Reply-To to improve deliverability.
                finalReplyTo = undefined;
            }
        }

        await transporter.sendMail({
            from: payload.from || process.env.DEFAULT_FROM_EMAIL || 'noreply@toolmail.com',
            to: recipientEmail,
            subject: payload.subject,
            html: emailHtml, // HTML version
            text: textContent, // Plain Text version (Multi-part)
            replyTo: finalReplyTo,
            attachments: nodemailerAttachments.length > 0 ? nodemailerAttachments : undefined,
            headers: headers
        });
    }

    private generatePlainText(html: string): string {
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
            .replace(/<br\s*\/?>/gi, '\n') // Replace <br> with newlines
            .replace(/<\/p>/gi, '\n\n') // Paragraphs to double newlines
            .replace(/<[^>]+>/g, '') // Strip remaining tags
            .replace(/&nbsp;/g, ' ') // decode entities logic could be more robust but this covers basic
            .replace(/\n\s+\n/g, '\n\n') // Collapse multiple newlines
            .trim();
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
            connectionTimeout: 30000,
            greetingTimeout: 30000,
            socketTimeout: 30000,
            family: 4, // Force IPv4
            tls: {
                rejectUnauthorized: false
            }
        } as any);

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

