// استدعاء المكتبات الأساسية
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// تفعيل مشاركة الموارد (CORS) لتسمح لتطبيق الـ Frontend بالاتصال بالسيرفر
app.use(cors());
app.use(express.json());

// إعدادات بيئة باي نتورك الرسمية
const PI_API_URL = 'https://api.minepi.com/v2';
// مفتاح الـ API السري الخاص بك المستخرج من Developer Portal لباي
const PI_SERVER_API_KEY = process.env.PI_API_KEY || 'تضع_هنا_مفتاح_API_الخاص_بالمطور';

// قاعدة بيانات مؤقتة في الذاكرة (يمكنك ربطها بـ Supabase لاحقاً)
let leaderboard = [
    { username: "أبو كريم [Elite]", score: 2450, rank: 1 },
    { username: "Kareem_Sniper", score: 2100, rank: 2 },
    { username: "Pi_King_99", score: 1950, rank: 3 }
];

let activePayments = {}; // لتتبع المعاملات قيد المعالجة

// ==========================================
// 1. مسارات لوحة الصدارة والنقاط (Leaderboard)
// ==========================================

// جلب قائمة المتصدرين
app.get('/api/leaderboard', (req, res) => {
    res.json(leaderboard);
});

// تسجيل نقاط جديدة بعد انتهاء اللعب
app.post('/api/score/submit', (req, res) => {
    const { username, score } = req.body;

    if (!username || score === undefined) {
        return res.status(400).json({ error: "البيانات المرسلة غير مكتملة" });
    }

    // إضافة اللاعب أو تحديث نقاطه إذا كانت أعلى
    const playerIndex = leaderboard.findIndex(p => p.username === username);
    if (playerIndex !== -1) {
        if (score > leaderboard[playerIndex].score) {
            leaderboard[playerIndex].score = score;
        }
    } else {
        leaderboard.push({ username, score, rank: 0 });
    }

    // إعادة ترتيب القائمة وتحديث الرتب المئوية للـ Top 10
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.map((player, index) => ({
        ...player,
        rank: index + 1
    })).slice(0, 10); // الاحتفاظ بأعلى 10 لاعبين فقط

    res.json({ message: "تم تسجيل النقاط بنجاح", leaderboard });
});

// ==========================================
// 2. مسارات ربط بوابة مدفوعات باي (Pi SDK Backend Flow)
// ==========================================

// المسار الأول: الموافقة على الدفع (Approve Payment)
// يستدعيه تطبيق الـ Frontend داخل دالة onReadyForServerApproval
app.post('/api/pi/approve', async (req, res) => {
    const { paymentId } = req.body;

    if (!paymentId) {
        return res.status(400).json({ error: "معرف الدفع (Payment ID) مفقود" });
    }

    try {
        // الاتصال بخوادم باي الرسمية للموافقة على المعاملة من طرف السيرفر
        const response = await axios.post(
            `${PI_API_URL}/payments/${paymentId}/approve`,
            {},
            {
                headers: {
                    'Authorization': `Key ${PI_SERVER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // حفظ المعاملة مؤقتاً كـ "مقبولة وبانتظار التوقيع على البلوكشين"
        activePayments[paymentId] = { status: 'approved', timestamp: Date.now() };

        console.log(`[Pi API] تم الموافقة بنجاح على المعاملة: ${paymentId}`);
        res.json({ message: "تمت موافقة الخادم بنجاح", piResponse: response.data });

    } catch (error) {
        console.error("[Pi API Error] خطأ أثناء الموافقة:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "فشلت عملية الموافقة من خادم باي" });
    }
});

// المسار الثاني: إكمال الدفع وصرف الميزة للعميل (Complete Payment)
// يستدعيه تطبيق الـ Frontend داخل دالة onReadyForServerCompletion بعد توقيع البلوكشين
app.post('/api/pi/complete', async (req, res) => {
    const { paymentId, txid } = req.body;

    if (!paymentId || !txid) {
        return res.status(400).json({ error: "بيانات المعاملة أو الـ Txid مفقودة" });
    }

    try {
        // إرسال طلب تأكيد الإغلاق النهائي لخوادم باي وإرسال الـ Transaction ID
        const response = await axios.post(
            `${PI_API_URL}/payments/${paymentId}/complete`,
            { txid: txid },
            {
                headers: {
                    'Authorization': `Key ${PI_SERVER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // تحديث حالة الدفع وتسليم الميزة للّاعب
        activePayments[paymentId] = { status: 'completed', txid, timestamp: Date.now() };

        console.log(`[Pi API] تم تسليم العملات وإغلاق الطلب بنجاح: ${paymentId}`);
        
        // هنا يمكنك تفعيل تذكرة اللعب أو إرسال السلاح للمستخدم بأمان
        res.json({ 
            success: true, 
            message: "تم تأكيد استلام الـ Pi بنجاح في محفظة التطبيق الخاصة بك!",
            piResponse: response.data 
        });

    } catch (error) {
        console.error("[Pi API Error] خطأ أثناء الإكمال:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "فشلت عملية إكمال وإغلاق المعاملة" });
    }
});

// تشغيل السيرفر والاستماع للمنافذ
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 خادم التحدي التنافسي لـ Pi Arena يعمل على المنفذ: ${PORT}`);
    console.log(`===================================================`);
});
