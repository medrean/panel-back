import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { JWT_SECRET, requireAuth } from '../models/middleware/auth.js';

const router = express.Router();

// 🔑 تسجيل دخول المشرف أو المدير
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
        }

        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: "بيانات الدخول غير صحيحة" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "بيانات الدخول غير صحيحة" });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
                assignedSites: user.assignedSites
            }
        });
    } catch (error) {
        res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
    }
});

// 👤 استرجاع بيانات المستخدم الحالي
router.get('/me', requireAuth, async (req, res) => {
    res.json({
        id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        role: req.user.role,
        assignedSites: req.user.assignedSites
    });
});

export default router;