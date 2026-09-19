import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
    blockAllExceptQatar: { type: Boolean, default: false },
    blockedCountries: { type: [String], default: [] },
    
    // إعدادات صندوق الكاش باك
    cashbackEnabled: { type: Boolean, default: false },
    cashbackImage: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);