"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const email_routes_1 = __importDefault(require("./routes/email.routes"));
const contacts_routes_1 = __importDefault(require("./routes/contacts.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const path_1 = __importDefault(require("path"));
// ... (previous imports)
const templates_routes_1 = __importDefault(require("./routes/templates.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
// Routes
app.use('/api/email', email_routes_1.default);
app.use('/api/contacts', contacts_routes_1.default);
app.use('/api/templates', templates_routes_1.default);
app.use('/api/settings', settings_routes_1.default);
app.use('/api/upload', upload_routes_1.default);
// Serve uploaded files statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.get('/', (req, res) => {
    res.send('ToolMail Backend Running');
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
