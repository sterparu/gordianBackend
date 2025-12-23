import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import emailRoutes from './routes/email.routes';
import contactRoutes from './routes/contacts.routes';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
import templatesRoutes from './routes/templates.routes';
import settingsRoutes from './routes/settings.routes';
import analyticsRoutes from './routes/analytics.routes';
import blacklistRoutes from './routes/blacklist.routes';
import paymentsRoutes from './routes/payments.routes';
import uploadRoutes from './routes/upload.routes';
import path from 'path';

// Routes
// Webhook endpoint needs raw body, so we apply json parser conditionally
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payments/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

app.use('/api/email', emailRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/upload', uploadRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
    res.send('ToolMail Backend Running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
