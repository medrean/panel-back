import jwt from 'jsonwebtoken';
import User from '../User.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'saas_super_secret_key_2026';

export async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({ error: "غير مصرح - الرجاء تسجيل الدخول" });
        }

        const token = header.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findById(decoded.userId).lean();
        if (!user) return res.status(401).json({ error: "المستخدم غير موجود" });

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: "جلسة غير صالحة أو منتهية" });
    }
}