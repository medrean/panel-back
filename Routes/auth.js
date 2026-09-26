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

// 🔒 تغيير كلمة مرور المستخدم الحالي (بمن فيهم المدير العام)
router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!newPassword || newPassword.trim() === '') {
            return res.status(400).json({ error: "كلمة المرور الجديدة مطلوبة" });
        }

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

        if (oldPassword) {
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ error: "كلمة المرور القديمة غير صحيحة" });
            }
        }

        user.password = await bcrypt.hash(newPassword.trim(), 10);
        await user.save();

        res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error) {
        res.status(500).json({ error: "فشل تغيير كلمة المرور: " + error.message });
    }
});

export default router;