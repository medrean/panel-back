import express from 'express';
import bcrypt from 'bcryptjs';
import Site from '../models/Site.js';
import User from '../models/User.js';
import Visitor from '../models/Visitor.js';
import Submission from '../models/Submission.js';
import { requireAuth } from '../models/middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
    try {
        let sitesQuery = {};
        if (req.user.role !== 'admin') {
            sitesQuery = { siteKey: { $in: req.user.assignedSites || [] } };
        }

        const sites = await Site.find(sitesQuery).sort({ createdAt: 1 }).lean();
        const timeLimit = new Date(Date.now() - 15000);

        for (let s of sites) {
            s.onlineCount = await Visitor.countDocuments({ siteKey: s.siteKey, lastSeen: { $gte: timeLimit } });
            s.totalSubmissions = await Submission.countDocuments({ siteKey: s.siteKey });
        }

        res.json(sites);
    } catch (error) {
        res.status(500).json({ error: "فشل جلب المواقع" });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - للمدير فقط" });
        }

        const { siteKey, name, domain, color } = req.body;
        if (!siteKey || !name) return res.status(400).json({ error: "المفتاح والاسم حقول إلزامية" });

        const cleanKey = siteKey.trim().toLowerCase().replace(/\s+/g, '_');
        const exists = await Site.findOne({ siteKey: cleanKey });
        if (exists) return res.status(400).json({ error: "مفتاح الموقع مستخدم مسبقاً" });

        const site = await Site.create({
            siteKey: cleanKey,
            name: name.trim(),
            domain: domain || '',
            color: color || '#2563eb'
        });

        res.json({ success: true, site });
    } catch (error) {
        res.status(500).json({ error: "فشل إنشاء الموقع" });
    }
});

router.get('/users', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "للمدير فقط" });
        }
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "فشل جلب المستخدمين" });
    }
});

router.post('/users', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "للمدير فقط" });
        }

        const { username, password, displayName, role, assignedSites } = req.body;
        if (!username || !password) return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبة" });

        const cleanUser = username.trim().toLowerCase();
        const exists = await User.findOne({ username: cleanUser });
        if (exists) return res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            username: cleanUser,
            password: hashedPassword,
            displayName: displayName || cleanUser,
            role: role || 'agent',
            assignedSites: assignedSites || []
        });

        res.json({
            success: true,
            user: {
                id: newUser._id,
                username: newUser.username,
                displayName: newUser.displayName,
                role: newUser.role,
                assignedSites: newUser.assignedSites
            }
        });
    } catch (error) {
        res.status(500).json({ error: "فشل إنشاء المشرف" });
    }
});

router.put('/users/:id', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "للمدير فقط" });
        }

        const { id } = req.params;
        const { password, displayName, role, assignedSites } = req.body;

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

        if (displayName !== undefined) user.displayName = displayName;
        if (role !== undefined) user.role = role;
        if (assignedSites !== undefined) user.assignedSites = assignedSites;

        if (password && password.trim() !== '') {
            user.password = await bcrypt.hash(password.trim(), 10);
        }

        await user.save();
        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
                assignedSites: user.assignedSites
            }
        });
    } catch (error) {
        res.status(500).json({ error: "فشل تحديث بيانات المستخدم: " + error.message });
    }
});

router.delete('/users/:id', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "للمدير فقط" });
        }
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" });
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "فشل حذف المستخدم" });
    }
});

router.post('/auto-register', async (req, res) => {
    try {
        const { siteKey, name } = req.body;
        if (!siteKey) return res.status(400).json({ error: "Missing siteKey" });

        const cleanKey = siteKey.trim().toLowerCase().replace(/\s+/g, '_');

        const exists = await Site.findOne({ siteKey: cleanKey });
        if (!exists) {
            const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];

            await Site.create({
                siteKey: cleanKey,
                name: (name && name.trim()) ? name.trim() : cleanKey,
                color: randomColor
            });
        } else if (name && name.trim() && exists.name !== name.trim()) {
            exists.name = name.trim();
            await exists.save();
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to auto-register site" });
    }
});

router.post('/save-schemas', async (req, res) => {
    try {
        const { siteKey, schemas } = req.body;
        if (!siteKey) return res.status(400).json({ error: "Missing siteKey" });

        const cleanKey = siteKey.trim().toLowerCase().replace(/\s+/g, '_');
        const site = await Site.findOne({ siteKey: cleanKey });
        if (site) {
            site.formSchemas = schemas || [];
            site.markModified('formSchemas');
            await site.save();
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to save schemas: " + error.message });
    }
});

router.delete('/:siteKey', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - للمدير فقط" });
        }
        const { siteKey } = req.params;
        const cleanKey = siteKey.trim().toLowerCase().replace(/\s+/g, '_');
        
        await Site.deleteOne({ siteKey: cleanKey });
        await Visitor.deleteMany({ siteKey: cleanKey });
        await Submission.deleteMany({ siteKey: cleanKey });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete site: " + error.message });
    }
});
router.post('/delete-multiple', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - للمدير فقط" });
        }
        const { siteKeys } = req.body;
        if (!siteKeys || !Array.isArray(siteKeys) || siteKeys.length === 0) {
            return res.status(400).json({ error: "يرجى تحديد مواقع صالحة للحذف" });
        }

        const cleanKeys = siteKeys.map(k => k.trim().toLowerCase().replace(/\s+/g, '_'));

        // Delete all selected sites and their corresponding visitor sessions and submissions
        await Site.deleteMany({ siteKey: { $in: cleanKeys } });
        await Visitor.deleteMany({ siteKey: { $in: cleanKeys } });
        await Submission.deleteMany({ siteKey: { $in: cleanKeys } });

        res.json({ success: true, message: `تم حذف ${cleanKeys.length} من المواقع المحددة بنجاح` });
    } catch (error) {
        res.status(500).json({ error: "فشل حذف المواقع المحددة: " + error.message });
    }
});


router.put('/:id', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - للمدير فقط" });
        }
        const { id } = req.params;
        const { name, domain, color } = req.body;
        
        const site = await Site.findById(id);
        if (!site) return res.status(404).json({ error: "الموقع غير موجود" });

        if (name !== undefined) site.name = name.trim();
        if (domain !== undefined) site.domain = domain.trim();
        if (color !== undefined) site.color = color.trim();
        
        await site.save();
        res.json({ success: true, site });
    } catch (error) {
        res.status(500).json({ error: "فشل تحديث بيانات الموقع: " + error.message });
    }
});

export default router;