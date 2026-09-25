import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
    visitorToken: { type: String, required: true, index: true },
    siteKey: { type: String, default: 'default', index: true },
    formName: { type: String, required: true },
    submissionData: { type: Object, default: {} },
    isImportant: { type: Boolean, default: false },
    isFinalSubmission: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Submission', submissionSchema);