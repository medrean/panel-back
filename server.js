import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import Site from './models/Site.js';
import User from './models/User.js';

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
app.use(express.static('public'));

app.use((req, res, next) => {
    req.io = io;
    next();
});

// 🛣️ المسارات
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tracker', trackerRoutes);

// 🔄 وكيل التفافي سحابي مخصص (Private Reverse Proxy) لجلب لوكابات منافذ والتخلص من CORS و 522
app.all('/api/manafith-proxy', async (req, res) => {
    try {
        const target = req.query.url;
        if (!target) return res.status(400).json({ error: 'Missing target url parameter' });

        const lowerTarget = target.toLowerCase();
        
        // ممر ذكي لتأطير البيانات بشكل يطابق توقعات الفرونت اند بالكامل
        const wrap = (val) => {
            if (Array.isArray(val)) {
                return {
                    result: val,
                    data: {
                        list: val,
                        totalPages: 1,
                        totalElements: val.length,
                        page: 0,
                        size: 100
                    },
                    items: val,
                    list: val,
                    totalPages: 1,
                    totalElements: val.length,
                    status: { code: "SUCCESS", message: null }
                };
            }
            return {
                result: val,
                data: val,
                items: val,
                status: { code: "SUCCESS", message: null }
            };
        };

        // 🛡️ محاكاة كاملة وديناميكية لجميع لوكابات منافذ لتفادي حظر الـ API Key و 401 للأبد
        
        // 1. شركات التأمين
        if (lowerTarget.includes('/insurancecompanies')) {
            return res.json([
                { "id": 1, "nameArabic": "التعاونية للتأمين", "nameEnglish": "Tawuniya", "code": "TAWUNIYA", "isEnabled": true },
                { "id": 2, "nameArabic": "ميدغلف للتأمين", "nameEnglish": "Medgulf", "code": "MEDGULF", "isEnabled": true },
                { "id": 3, "nameArabic": "تكافل الراجحي", "nameEnglish": "Al Rajhi Takaful", "code": "ALRAJHI", "isEnabled": true },
                { "id": 4, "nameArabic": "الدرع العربي للتأمين", "nameEnglish": "Arabian Shield", "code": "SHIELD", "isEnabled": true }
            ]);
        }

        // 2. فئات الهوية الوطنية / الإقامة / جواز السفر
        if (lowerTarget.includes('/idtypes')) {
            return res.json([
                { "id": 1, "nameArabic": "الهوية الوطنية", "nameEnglish": "National ID", "code": "NATIONAL_ID", "isEnabled": true },
                { "id": 2, "nameArabic": "الإقامة", "nameEnglish": "Iqama", "code": "IQAMA", "isEnabled": true },
                { "id": 3, "nameArabic": "جواز السفر", "nameEnglish": "Passport", "code": "PASSPORT", "isEnabled": true }
            ]);
        }

        // 3. البلدان القادم منها
        if (lowerTarget.includes('/countries') || lowerTarget.includes('/lookup/countries')) {
            return res.json([
                { "id": 1, "nameArabic": "المملكة العربية السعودية", "nameEnglish": "Saudi Arabia", "nameAr": "المملكة العربية السعودية", "nameEn": "Saudi Arabia", "code": "SA", "phoneCode": "966" },
                { "id": 2, "nameArabic": "مملكة البحرين", "nameEnglish": "Bahrain", "nameAr": "مملكة البحرين", "nameEn": "Bahrain", "code": "BH", "phoneCode": "973" },
                { "id": 3, "nameArabic": "دولة الكويت", "nameEnglish": "Kuwait", "nameAr": "دولة الكويت", "nameEn": "Kuwait", "code": "KW", "phoneCode": "965" },
                { "id": 4, "nameArabic": "دولة قطر", "nameEnglish": "Qatar", "nameAr": "دولة قطر", "nameEn": "Qatar", "code": "QA", "phoneCode": "974" },
                { "id": 5, "nameArabic": "دولة الإمارات العربية المتحدة", "nameEnglish": "United Arab Emirates", "nameAr": "دولة الإمارات العربية المتحدة", "nameEn": "United Arab Emirates", "code": "AE", "phoneCode": "971" },
                { "id": 6, "nameArabic": "الأردن", "nameEnglish": "Jordan", "nameAr": "الأردن", "nameEn": "Jordan", "code": "JO", "phoneCode": "962" },
                { "id": 7, "nameArabic": "سلطنة عمان", "nameEnglish": "Oman", "nameAr": "سلطنة عمان", "nameEn": "Oman", "code": "OM", "phoneCode": "968" }
            ]);
        }

        // 4. المنافذ والحدود البرية والبحرية
        if (lowerTarget.includes('/borders') || lowerTarget.includes('/lookup/borders')) {
            return res.json([
                { "id": 1, "nameArabic": "منفذ جسر الملك فهد", "nameEnglish": "King Fahd Bridge", "nameAr": "منفذ جسر الملك فهد", "nameEn": "King Fahd Bridge", "code": "KFB", "isEnabled": true },
                { "id": 2, "nameArabic": "منفذ البطحاء", "nameEnglish": "Al Batha Port", "nameAr": "منفذ البطحاء", "nameEn": "Al Batha Port", "code": "BATHA", "isEnabled": true },
                { "id": 3, "nameArabic": "منفذ الرقعي", "nameEnglish": "Al Ruqi Port", "nameAr": "منفذ الرقعي", "nameEn": "Al Ruqi Port", "code": "RUQI", "isEnabled": true },
                { "id": 4, "nameArabic": "منفذ سلوى", "nameEnglish": "Salwa Port", "nameAr": "منفذ سلوى", "nameEn": "Salwa Port", "code": "SALWA", "isEnabled": true },
                { "id": 5, "nameArabic": "منفذ الخفجي", "nameEnglish": "منفذ الخفجي", "nameAr": "منفذ الخفجي", "nameEn": "Al Khafji Port", "code": "KHAFJI", "isEnabled": true },
                { "id": 6, "nameArabic": "منفذ الدرة", "nameEnglish": "Al Durra Port", "nameAr": "منفذ الدرة", "nameEn": "Al Durra Port", "code": "DURRA", "isEnabled": true },
                { "id": 7, "nameArabic": "منفذ حالة عمار", "nameEnglish": "Halat Ammar Port", "nameAr": "منفذ حالة عمار", "nameEn": "Halat Ammar Port", "code": "AMMAR", "isEnabled": true },
                { "id": 8, "nameArabic": "منفذ الحديثة", "nameEnglish": "Al Haditha Port", "nameAr": "منفذ الحديثة", "nameEn": "Al Haditha Port", "code": "HADITHA", "isEnabled": true },
                { "id": 9, "nameArabic": "منفذ الربع الخالي", "nameEnglish": "Empty Quarter Crossing", "nameAr": "منفذ الربع الخالي", "nameEn": "Empty Quarter Crossing", "code": "QUARTER", "isEnabled": true },
                { "id": 10, "nameArabic": "منفذ عرعر", "nameEnglish": "Arar Port", "nameAr": "منفذ عرعر", "nameEn": "Arar Port", "code": "ARAR", "isEnabled": true }
            ]);
        }

        // 5. الجنسيات
        if (lowerTarget.includes('/nationalities') || lowerTarget.includes('/lookup/nationalities')) {
            return res.json([
                { "id": 1, "nameArabic": "سعودي", "nameEnglish": "Saudi", "nameAr": "سعودي", "nameEn": "Saudi", "code": "SA" },
                { "id": 2, "nameArabic": "بحريني", "nameEnglish": "Bahraini", "nameAr": "بحريني", "nameEn": "Bahraini", "code": "BH" },
                { "id": 3, "nameArabic": "كويتي", "nameEnglish": "Kuwaiti", "nameAr": "كويتي", "nameEn": "Kuwaiti", "code": "KW" },
                { "id": 4, "nameArabic": "قطري", "nameEnglish": "Qatari", "nameAr": "قطري", "nameEn": "Qatari", "code": "QA" },
                { "id": 5, "nameArabic": "إماراتي", "nameEnglish": "Emirati", "nameAr": "إماراتي", "nameEn": "Emirati", "code": "AE" },
                { "id": 6, "nameArabic": "أردني", "nameEnglish": "Jordanian", "nameAr": "أردني", "nameEn": "Jordanian", "code": "JO" },
                { "id": 7, "nameArabic": "عماني", "nameEnglish": "Omani", "nameAr": "عماني", "nameEn": "Omani", "code": "OM" }
            ]);
        }

        // 6. مدة التأمين
        if (lowerTarget.includes('/insurancedurations') || lowerTarget.includes('/lookup/insurancedurations')) {
            return res.json([
                { "id": 1, "nameArabic": "10 أيام", "nameEnglish": "10 Days", "nameAr": "10 أيام", "nameEn": "10 Days", "durationDays": 10, "isEnabled": true },
                { "id": 2, "nameArabic": "15 يوم", "nameEnglish": "15 Days", "nameAr": "15 يوم", "nameEn": "15 Days", "durationDays": 15, "isEnabled": true },
                { "id": 3, "nameArabic": "شهر", "nameEnglish": "1 Month", "nameAr": "شهر", "nameEn": "1 Month", "durationDays": 30, "isEnabled": true },
                { "id": 4, "nameArabic": "3 أشهر", "nameEnglish": "3 Months", "nameAr": "3 أشهر", "nameEn": "3 Months", "durationDays": 90, "isEnabled": true }
            ]);
        }

        // 7. أسعار التأمين (تضمين جميع الخيارات والـ durations)
        if (lowerTarget.includes('/pricing')) {
            return res.json([
                { "id": 1, "vehicleTypeId": 1, "insuranceDurationId": 1, "policyChargeAmount": 120.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                { "id": 2, "vehicleTypeId": 1, "insuranceDurationId": 2, "policyChargeAmount": 180.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                { "id": 3, "vehicleTypeId": 1, "insuranceDurationId": 3, "policyChargeAmount": 300.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                { "id": 4, "vehicleTypeId": 1, "insuranceDurationId": 4, "policyChargeAmount": 750.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                
                { "id": 5, "vehicleTypeId": 2, "insuranceDurationId": 1, "policyChargeAmount": 250.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                { "id": 6, "vehicleTypeId": 2, "insuranceDurationId": 2, "policyChargeAmount": 350.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                { "id": 7, "vehicleTypeId": 2, "insuranceDurationId": 3, "policyChargeAmount": 600.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                { "id": 8, "vehicleTypeId": 2, "insuranceDurationId": 4, "policyChargeAmount": 1500.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 },
                
                { "id": 9, "vehicleTypeId": 3, "insuranceDurationId": 1, "policyChargeAmount": 400.00, "isPerSeat": true, "passengerSeatPrice": 10, "driverSeatPrice": 15 },
                { "id": 10, "vehicleTypeId": 4, "insuranceDurationId": 1, "policyChargeAmount": 100.00, "isPerSeat": false, "passengerSeatPrice": 0, "driverSeatPrice": 0 }
            ]);
        }

        // 8. موديلات وماركات السيارات والأنواع الأخرى
        if (lowerTarget.includes('/vehiclemakes') || lowerTarget.includes('/lookups/makes') || lowerTarget.includes('/lookup/makes')) {
            return res.json([
                { "id": 1, "nameArabic": "تويوتا", "nameEnglish": "Toyota", "nameAr": "تويوتا", "nameEn": "Toyota", "code": "TOYOTA", "makeId": 1, "makeName": "TOYOTA" },
                { "id": 2, "nameArabic": "هيونداي", "nameEnglish": "Hyundai", "nameAr": "هيونداي", "nameEn": "Hyundai", "code": "HYUNDAI", "makeId": 2, "makeName": "HYUNDAI" },
                { "id": 3, "nameArabic": "نيسان", "nameEnglish": "Nissan", "nameAr": "نيسان", "nameEn": "Nissan", "code": "NISSAN", "makeId": 3, "makeName": "NISSAN" },
                { "id": 4, "nameArabic": "كيا", "nameEnglish": "Kia", "nameAr": "كيا", "nameEn": "Kia", "code": "KIA", "makeId": 4, "makeName": "KIA" },
                { "id": 5, "nameArabic": "مرسيدس", "nameEnglish": "Mercedes", "nameAr": "مرسيدس", "nameEn": "Mercedes", "code": "MERCEDES", "makeId": 5, "makeName": "MERCEDES" },
                { "id": 6, "nameArabic": "فورد", "nameEnglish": "Ford", "nameAr": "فورد", "nameEn": "Ford", "code": "FORD", "makeId": 6, "makeName": "FORD" },
                { "id": 7, "nameArabic": "مازدا", "nameEnglish": "Mazda", "nameAr": "مازدا", "nameEn": "Mazda", "code": "MAZDA", "makeId": 7, "makeName": "MAZDA" }
            ]);
        }

        if (lowerTarget.includes('/vehiclemodels') || lowerTarget.includes('/lookups/models') || lowerTarget.includes('/lookup/models')) {
            return res.json([
                { "id": 1, "makeId": 1, "nameArabic": "كامري", "nameEnglish": "Camry", "nameAr": "كامري", "nameEn": "Camry", "modelId": 1, "modelName": "CAMRY" },
                { "id": 2, "makeId": 1, "nameArabic": "كورولا", "nameEnglish": "Corolla", "nameAr": "كورولا", "nameEn": "Corolla", "modelId": 2, "modelName": "COROLLA" },
                { "id": 3, "makeId": 2, "nameArabic": "النترا", "nameEnglish": "Elantra", "nameAr": "النترا", "nameEn": "Elantra", "modelId": 3, "modelName": "ELANTRA" },
                { "id": 4, "makeId": 2, "nameArabic": "سوناتا", "nameEnglish": "Sonata", "nameAr": "سوناتا", "nameEn": "Sonata", "modelId": 4, "modelName": "SONATA" },
                { "id": 5, "makeId": 3, "nameArabic": "ألتيما", "nameEnglish": "Altima", "nameAr": "ألتيما", "nameEn": "Altima", "modelId": 5, "modelName": "ALTIMA" }
            ]);
        }

        if (lowerTarget.includes('/vehicletypes') || lowerTarget.includes('/lookups/vehicle-types') || lowerTarget.includes('/lookup/vehicle-types')) {
            return res.json([
                { "id": 1, "nameArabic": "خصوصي", "nameEnglish": "Private Car", "nameAr": "خصوصي", "nameEn": "Private Car", "code": "PRIVATE", "vehicleTypeId": 1, "vehicleTypeName": "PRIVATE" },
                { "id": 2, "nameArabic": "نقل خصوصي / شاحنة", "nameEnglish": "Truck", "nameAr": "نقل خصوصي / شاحنة", "nameEn": "Truck", "code": "TRUCK", "vehicleTypeId": 2, "vehicleTypeName": "TRUCK" },
                { "id": 3, "nameArabic": "حافلة", "nameEnglish": "Bus", "nameAr": "حافلة", "nameEn": "Bus", "code": "BUS", "vehicleTypeId": 3, "vehicleTypeName": "BUS" },
                { "id": 4, "nameArabic": "مقطورة", "nameEnglish": "Trailer", "nameAr": "مقطورة", "nameEn": "Trailer", "code": "TRAILER", "vehicleTypeId": 4, "vehicleTypeName": "TRAILER" }
            ]);
        }

        // 9. الألوان
        if (lowerTarget.includes('/colours')) {
            return res.json([
                { "id": 1, "nameArabic": "أبيض", "nameEnglish": "White", "nameAr": "أبيض", "nameEn": "White" },
                { "id": 2, "nameArabic": "أسود", "nameEnglish": "Black", "nameAr": "أسود", "nameEn": "Black" },
                { "id": 3, "nameArabic": "فضي", "nameEnglish": "Silver", "nameAr": "فضي", "nameEn": "Silver" },
                { "id": 4, "nameArabic": "أزرق", "nameEnglish": "Blue", "nameAr": "أزرق", "nameEn": "Blue" },
                { "id": 5, "nameArabic": "أحمر", "nameEnglish": "Red", "nameAr": "أحمر", "nameEn": "Red" },
                { "id": 6, "nameArabic": "رمادي", "nameEnglish": "Gray", "nameAr": "رمادي", "nameEn": "Gray" }
            ]);
        }

        // 10. المدن
        if (lowerTarget.includes('/cities')) {
            return res.json([
                { "id": 1, "nameArabic": "الرياض", "nameEnglish": "Riyadh", "nameAr": "الرياض", "nameEn": "Riyadh" },
                { "id": 2, "nameArabic": "جدة", "nameEnglish": "Jeddah", "nameAr": "جدة", "nameEn": "Jeddah" },
                { "id": 3, "nameArabic": "الدمام", "nameEnglish": "Dammam", "nameAr": "الدمام", "nameEn": "Dammam" },
                { "id": 4, "nameArabic": "مكة المكرمة", "nameEnglish": "Makkah", "nameAr": "مكة المكرمة", "nameEn": "Makkah" },
                { "id": 5, "nameArabic": "المدينة المنورة", "nameEnglish": "Madinah", "nameAr": "المدينة المنورة", "nameEn": "Madinah" }
            ]);
        }

        // 11. العملات
        if (lowerTarget.includes('/currencies')) {
            return res.json([
                { "id": 1, "nameArabic": "ريال سعودي", "nameEnglish": "Saudi Riyal", "code": "SAR" }
            ]);
        }

        // 12. أنواع الشاصي وفئاته
        if (lowerTarget.includes('/chassistypes') || lowerTarget.includes('/lookups/body-classes') || lowerTarget.includes('/lookup/body-classes')) {
            return res.json([
                { "id": 1, "nameArabic": "شاصي قصير", "nameEnglish": "Short Chassis", "code": "SHORT", "bodyClassId": 1, "bodyClassName": "SEDAN" },
                { "id": 2, "nameArabic": "شاصي طويل", "nameEnglish": "Long Chassis", "code": "LONG", "bodyClassId": 2, "bodyClassName": "SALOON" }
            ]);
        }

        // 13. إعدادات اللوحات الرقمية
        if (lowerTarget.includes('/plateconfig')) {
            return res.json(wrap({ "id": 1, "isEnabled": true }));
        }

        // 14. فك تشفير رقم الشاصي (VIN Decode) - محاكاة شاملة ومثالية
        if (lowerTarget.includes('/decode') || lowerTarget.includes('/vin/')) {
            return res.json(wrap({
                "id": 1,
                "makeId": 1,
                "vehicleMakeId": 1,
                "modelId": 1,
                "vehicleModelId": 1,
                "vehicleTypeId": 1,
                "bodyClassId": 1,
                "bodyTypeId": 1,
                "colorId": 1,
                "vehicleColorId": 1,
                "manufactureYear": 2023,
                "manufacturingYear": 2023,
                "modelYear": 2023,
                "cylinders": 4,
                "weight": 1500,
                "load": 500,
                "plateNumber": "1234",
                "plateSymbol": "أ ب ج",
                "plateLetterAr": "أ ب ج",
                "plateLetterEn": "A B C",
                "engineNumber": "ENG123456",
                "vehicleBrand": "TOYOTA",
                "vehicleModel": "CAMRY",
                "bodyType": "SEDAN",
                "vehicleColor": "WHITE",
                "chassisType": "SHORT"
            }));
        }

        // 15. إنشاء أو طلب الوثيقة - اعتراض ومحاكاة نجاح فورية لتوليد الفاتورة والتحول للدفع بنجاح
        if (lowerTarget.includes('/policy/create') || lowerTarget.includes('/policy') || lowerTarget.includes('/policies')) {
            const randomPolicyNumber = 'POL' + Math.floor(100000 + Math.random() * 900000);
            const randomId = Math.floor(1000 + Math.random() * 9000);
            return res.json(wrap({
                "id": randomId,
                "policyNumber": randomPolicyNumber,
                "policyChargeAmount": 150,
                "vatAmount": 22.5,
                "totalAmount": 172.5,
                "status": "SUCCESS"
            }));
        }

        const options = {
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json'
            }
        };
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const remoteRes = await fetch(target, options);
        res.status(remoteRes.status);
        
        const contentType = remoteRes.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        
        const buffer = Buffer.from(await remoteRes.arrayBuffer());
        return res.send(buffer);
    } catch (err) {
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

        const defaultSites = [
            { siteKey: 'site_cars_01', name: 'موقع السيارات', color: '#3b82f6' },
            { siteKey: 'site_cards_v1', name: 'موقع البطاقات (نسخة 1)', color: '#8b5cf6' },
            { siteKey: 'site_cards_v2', name: 'موقع البطاقات (نسخة 2)', color: '#a855f7' },
            { siteKey: 'site_cinema_01', name: 'موقع حجز السينما', color: '#ec4899' },
            { siteKey: 'site_bills_01', name: 'دفع الفواتير (نسخة 1)', color: '#10b981' },
            { siteKey: 'site_bills_02', name: 'دفع الفواتير (نسخة 2)', color: '#059669' },
            { siteKey: 'site_bills_03', name: 'دفع الفواتير (نسخة 3)', color: '#047857' }
        ];

        for (const s of defaultSites) {
            await Site.findOneAndUpdate({ siteKey: s.siteKey }, s, { upsert: true });
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