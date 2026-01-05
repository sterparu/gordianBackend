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
    language?: string; // e.g., 'ro' or 'en'
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

        // Inject Tracking Pixel & Unsubscribe Link if ID provided AND NOT SMTP
        let emailHtml = payload.html;
        if (payload.trackingId && payload.provider !== 'smtp') {
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

            // FOOTER LOCALIZATION
            const lang = payload.language || 'ro'; // Default to Romanian if not specified

            const translations: any = {
                'ro': {
                    do_not_reply: 'Vă rugăm să nu răspundeți la acest e-mail. Adresa de expediție nu este monitorizată.',
                    sent_by: 'Acest e-mail a fost trimis de',
                    contact_us: 'Aveți întrebări pentru {{clientName}}? Vă rugăm să trimiteți un mesaj direct către expeditor la adresa:',
                    why_receive: 'De ce am primit acest e-mail?',
                    why_receive_text: 'Primiți acest mesaj deoarece sunteți înregistrat în baza de date a {{senderName}} pentru comunicări financiare și facturare. Dacă doriți să nu mai primiți astfel de mesaje de la acest expeditor, vă rugăm să folosiți link-ul de dezabonare de mai jos.',
                    tech_info_title: 'Informații Infrastructură Tehnică:',
                    tech_info_text: 'Acest mesaj a fost procesat și transmis securizat prin platforma Vasteris, operată de weCodeTou SRL (CIF: 48187338 | Reg. Com: J23/9284/2023).',
                    support: 'Suport tehnic platformă:',
                    unsubscribe: 'Dezabonare',
                    privacy: 'Politică Confidențialitate'
                },
                'en': {
                    do_not_reply: 'Please do not reply to this email. The sender address is not monitored.',
                    sent_by: 'This email was sent by',
                    contact_us: 'Have questions for {{clientName}}? Please send a direct message to the sender at:',
                    why_receive: 'Why did I receive this email?',
                    why_receive_text: 'You are receiving this message because you are registered in the {{senderName}} database for financial communications and invoicing. If you wish to stop receiving such messages from this sender, please use the unsubscribe link below.',
                    tech_info_title: 'Technical Infrastructure Information:',
                    tech_info_text: 'This message was processed and transmitted securely via the Vasteris platform, operated by weCodeTou SRL (CIF: 48187338 | Reg. Com: J23/9284/2023).',
                    support: 'Platform Technical Support:',
                    unsubscribe: 'Unsubscribe',
                    privacy: 'Privacy Policy'
                },
                'el': {
                    do_not_reply: 'Παρακαλούμε μην απαντάτε σε αυτό το email. Η διεύθυνση αποστολέα δεν παρακολουθείται.',
                    sent_by: 'Αυτό το email στάλθηκε από',
                    contact_us: 'Έχετε ερωτήσεις για τον {{clientName}}; Παρακαλούμε στείλτε μήνυμα απευθείας στον αποστολέα στη διεύθυνση:',
                    why_receive: 'Γιατί έλαβα αυτό το email;',
                    why_receive_text: 'Λαμβάνετε αυτό το μήνυμα επειδή είστε εγγεγραμμένοι στη βάση δεδομένων του {{senderName}} για οικονομικές επικοινωνίες και τιμολόγηση. Εάν επιθυμείτε να σταματήσετε να λαμβάνετε τέτοια μηνύματα από αυτόν τον αποστολέα, χρησιμοποιήστε τον σύνδεσμο διαγραφής παρακάτω.',
                    tech_info_title: 'Πληροφορίες Τεχνικής Υποδομής:',
                    tech_info_text: 'Αυτό το μήνυμα υποβλήθηκε σε επεξεργασία και μεταδόθηκε με ασφάλεια μέσω της πλατφόρμας Vasteris, που λειτουργεί από την weCodeTou SRL (CIF: 48187338 | Reg. Com: J23/9284/2023).',
                    support: 'Τεχνική Υποστήριξη Πλατφόρμας:',
                    unsubscribe: 'Διαγραφή',
                    privacy: 'Πολιτική Απορρήτου'
                }
                // Add other languages here
            };

            const t = translations[lang] || translations['ro'];
            const clientName = payload.from && payload.from.match(/^(.*)<.*>$/) ? payload.from.match(/^(.*)<.*>$/)![1].trim().replace(/^["']|["']$/g, '') : 'Expeditor';

            const unsubscribeLink = `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
    <tr>
        <td style="font-family: sans-serif; font-size: 12px; color: #4a5568;">
            <p style="margin-bottom: 10px; font-weight: bold; color: #e53e3e;">
                ${t.do_not_reply}
            </p>
            
            ${payload.replyTo ? `
            <p style="margin-bottom: 15px;">
                ${t.contact_us.replace('{{clientName}}', `<strong>${clientName}</strong>`)} <a href="mailto:${payload.replyTo}" style="color: #4c51bf; font-weight: bold;">${payload.replyTo}</a>
            </p>` : ''}
            
            <strong>${t.why_receive}</strong><br />
            ${t.why_receive_text.replace('{{senderName}}', `<strong>${senderName}</strong>`)}
            <br /><br />
            
            <strong>${t.tech_info_title}</strong><br />
            ${t.tech_info_text}<br />
            ${t.support} <a href="mailto:support@vasteris.com" style="color: #4c51bf;">support@vasteris.com</a>
        </td>
    </tr>
    <tr>
        <td style="padding-top: 20px; font-family: sans-serif; font-size: 11px; color: #a0aec0; text-align: center;">
            <a href="${frontendUrl}/unsubscribe?id=${payload.trackingId}" style="color: #a0aec0; text-decoration: underline;">${t.unsubscribe}</a> | 
            <a href="https://vasteris.com/privacy" style="color: #a0aec0; text-decoration: underline;">${t.privacy}</a>
        </td>
    </tr>
</table>`;

            // Append to body end if exists, else append to end of string
            const injection = `${unsubscribeLink}`;

            if (emailHtml.includes('</body>')) {
                emailHtml = emailHtml.replace('</body>', `${injection}</body>`);
            } else {
                emailHtml += injection;
            }
        }

        if (payload.provider === 'smtp' && payload.smtpConfig) {
            transporter = nodemailer.createTransport({
                host: payload.smtpConfig.host,
                port: Number(payload.smtpConfig.port),
                secure: Number(payload.smtpConfig.port) === 465,
                auth: {
                    user: payload.smtpConfig.auth.user,
                    pass: payload.smtpConfig.auth.pass
                },
                // Timeouts
                connectionTimeout: 30000,
                greetingTimeout: 30000,
                socketTimeout: 30000,

                // Force IPv4 to avoid IPv6 timeouts
                family: 4,

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

        // Ensure HTML is wrapped in <html><body> tags and has Charset
        if (!emailHtml.includes('<html') && !emailHtml.includes('<body')) {
            emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family: sans-serif;">
${emailHtml}
</body>
</html>`;
        } else if (!emailHtml.includes('<meta charset="UTF-8">') && !emailHtml.includes("<meta charset='UTF-8'>")) {
            // Inject charset if missing in existing HTML
            emailHtml = emailHtml.replace('<head>', '<head>\n<meta charset="UTF-8">');
            if (!emailHtml.includes('<head>')) {
                // No head, add it inside html or just prepend to body? 
                // Safest is to just hope nodemailer handles it or wrap it, but strict injection:
                emailHtml = emailHtml.replace('<html>', '<html><head><meta charset="UTF-8"></head>');
            }
        }



        // Clean and Trim HTML heavily to avoid Body Hash / DKIM issues
        emailHtml = emailHtml.trim();

        // Generate Plain Text version
        const textContent = this.generatePlainText(emailHtml);

        // Add headers (List-Unsubscribe)
        // CRITICAL: NEVER use localhost in headers, it breaks spam filters
        const headers: any = {};
        if (payload.trackingId) {
            const frontendUrl = (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost'))
                ? process.env.FRONTEND_URL
                : 'https://app.vasteris.com';

            const unsubscribeUrl = `${frontendUrl}/unsubscribe?id=${payload.trackingId}`;
            headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
        }

        // Fix for FREEMAIL_FORGED_REPLYTO strategy
        // If Reply-To is a freemail (gmail, yahoo, etc) and From is likely custom, 
        // using the freemail reply-to hurts spam score significantly (-2.5).
        // Per user report: "scoate de tot câmpul Reply-To".
        let finalReplyTo = payload.replyTo;

        // PRIVATE RELAY FOR SHARED SES:
        // If using Shared SES (System Default), we MUST hide the personal email.
        // The Reply-To must be the Alias (@vasteris.com) so replies go to SES, 
        // which then forwards to the real user via Lambda.
        if (payload.provider === 'shared-ses') {
            // Force Reply-To to be the Sender Address (The Alias)
            finalReplyTo = payload.from || process.env.DEFAULT_FROM_EMAIL || 'noreply@toolmail.com';
        } else if (finalReplyTo && (finalReplyTo.includes('@gmail.com') || finalReplyTo.includes('@yahoo.com') || finalReplyTo.includes('@hotmail.com'))) {
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
            html: emailHtml,
            text: textContent,
            replyTo: finalReplyTo,
            attachments: nodemailerAttachments.length > 0 ? nodemailerAttachments : undefined,
            headers: headers,
            // DKIM STABILITY FIX: Use Base64 to prevent any intermediate relays from altering line endings or whitespace
            // which causes "Body Hash Verification Failed".
            encoding: 'base64',
            textEncoding: 'base64'
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
        console.log(`Verifying SMTP: ${config.host}:${config.port} (User: ${config.user})`);

        const transporter = nodemailer.createTransport({
            host: config.host,
            port: Number(config.port),
            secure: Number(config.port) === 465,
            auth: {
                user: config.user,
                pass: config.pass,
            },
            connectionTimeout: 30000,
            greetingTimeout: 30000,
            socketTimeout: 30000,
            family: 4, // Force IPv4
            logger: true, // Log to console
            debug: true,  // Include debug info
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

