import mongoose from 'mongoose';

const siteSchema = new mongoose.Schema({
    siteKey: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    domain: { type: String, default: '' },
    color: { type: String, default: '#2563eb' },
    formSchemas: { type: mongoose.Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Site', siteSchema);