import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    mode: { type: String, default: 'blacklist' }, // 'blacklist' أو 'whitelist'
    allowedCountry: { type: String, default: '' },
    allowedCountryName: { type: String, default: '' }
});

const blockedCountrySchema = new mongoose.Schema({
    countryCode: { type: String, required: true, unique: true, uppercase: true },
    countryName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

export const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
export default mongoose.model('BlockedCountry', blockedCountrySchema);