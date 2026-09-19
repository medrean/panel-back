import mongoose from 'mongoose';

const VisitorSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    siteKey: { type: String, default: 'site_cars_01' },
    ip: { type: String, default: '' },
    isVpn: { type: Boolean, default: false },
    vpnDetails: { type: Object, default: {} },
    currentPage: { type: String, default: '' },
    pageTitle: { type: String, default: 'الرئيسية' },
    country: { type: String, default: 'UNKNOWN' },
    device: { type: String, default: 'سطح مكتب' },
    name: { type: String, default: 'زائر جديد' },
    phone: { type: String, default: '' },
    nationalId: { type: String, default: '' },
    leadStatus: { type: String, default: 'new' },
    isBlocked: { type: Boolean, default: false },
    status: { type: String, default: 'idle' },
    redirectUrl: { type: String, default: '' },
    authCode: { type: String, default: '' },
    callAlert: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },
    lastSubmissionDate: { type: Date },
    isRead: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Visitor', VisitorSchema);