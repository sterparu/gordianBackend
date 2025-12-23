"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const aws = __importStar(require("@aws-sdk/client-ses"));
const client_ses_1 = require("@aws-sdk/client-ses");
class EmailService {
    constructor() {
        this.sharedSesClient = null;
        this.sharedSesTransporter = null;
        // Initialize Shared SES if env vars are present
        if (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID) {
            this.sharedSesClient = new client_ses_1.SESClient({
                apiVersion: '2010-12-01',
                region: process.env.AWS_REGION,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
            });
            this.sharedSesTransporter = nodemailer_1.default.createTransport({
                SES: { ses: this.sharedSesClient, aws },
            });
        }
    }
    static getInstance() {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }
    async sendEmail(payload) {
        // Validation logic can remain simple or expanded
        // this.validateConfiguration(payload);
        let transporter;
        // Determine recipient and attachments
        const recipientEmail = typeof payload.to === 'string' ? payload.to : payload.to.email;
        const attachments = (typeof payload.to === 'object' && payload.to.attachments) ? payload.to.attachments : [];
        // Map to Nodemailer attachment format
        const nodemailerAttachments = attachments.map(att => ({
            filename: att.name,
            path: att.url
        }));
        if (payload.provider === 'smtp' && payload.smtpConfig) {
            transporter = nodemailer_1.default.createTransport(payload.smtpConfig);
        }
        else if (payload.provider === 'custom-ses' && payload.sesConfig) {
            const ses = new client_ses_1.SESClient({
                apiVersion: '2010-12-01',
                region: payload.sesConfig.region,
                credentials: {
                    accessKeyId: payload.sesConfig.accessKeyId,
                    secretAccessKey: payload.sesConfig.secretAccessKey,
                }
            });
            transporter = nodemailer_1.default.createTransport({
                SES: { ses, aws },
            });
        }
        else {
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
            html: payload.html,
            replyTo: payload.replyTo,
            attachments: nodemailerAttachments.length > 0 ? nodemailerAttachments : undefined
        });
    }
    validateConfiguration(options) {
        if (options.provider === 'shared-ses') {
            if (!this.sharedSesTransporter) {
                throw new Error('Shared SES is not configured on the server (missing env vars). Please configure a Custom Provider in Settings.');
            }
        }
        // Could add basic SMTP validation here too if needed, but connection verify is slow.
    }
    async verifyEmailIdentity(email) {
        if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID) {
            throw new Error('Server SES credentials are not configured.');
        }
        const ses = new client_ses_1.SESClient({
            apiVersion: '2010-12-01',
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });
        // Dynamically import command to avoid top-level issues if any
        const { VerifyEmailIdentityCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
        await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
    }
    async verifySMTP(config) {
        const transporter = nodemailer_1.default.createTransport({
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
        }
        catch (error) {
            console.error('SMTP Verification Error:', error);
            throw error;
        }
    }
    async checkEmailIdentityStatus(email) {
        if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID) {
            throw new Error('Server SES credentials are not configured.');
        }
        const ses = new client_ses_1.SESClient({
            apiVersion: '2010-12-01',
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });
        const { GetIdentityVerificationAttributesCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
        const response = await ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [email] }));
        const attributes = response.VerificationAttributes?.[email];
        return attributes?.VerificationStatus || 'NotFound';
    }
}
exports.EmailService = EmailService;
