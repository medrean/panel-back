import mongoose from 'mongoose';

const bannedIPSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    reason: { type: String, default: 'حظر يدوي من اللوحة' },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('BannedIP', bannedIPSchema);