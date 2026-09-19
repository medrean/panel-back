import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    displayName: { type: String, default: 'مشرف' },
    role: { type: String, enum: ['admin', 'agent'], default: 'agent' },
    assignedSites: [{ type: String }], // مصفوفة تحتوي على مفاتيح المواقع المصرح له بها
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);