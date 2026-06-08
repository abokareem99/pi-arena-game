const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path'); // تم استدعاء المكتبة للتحكم في مسارات الملفات الثابتة
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const PI_API_URL = 'https://api.minepi.com/v2';
const PI_SERVER_API_KEY = process.env.PI_API_KEY || 'تضع_هنا_مفتاح_API_الخاص_بالمطور';

let leaderboard = [
    { username: "أبو كريم [Elite]", score: 2450, rank: 1 },
    { username: "Kareem_Sniper", score: 2100, rank: 2 },
    { username: "Pi_King_99", score: 1950, rank: 3 }
];

let activePayments = {};

// ==========================================
// الإعداد الحاسم: ربط واجهة المستخدم بالخلفية والسياسات القانونية
// ==========================================

// تشغيل الواجهة (index.html) تلقائياً عند فتح الرابط الرئيسي للمشروع
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار شروط الخدمة (Terms of Service) لمنع خطأ Cannot GET
app.get('/terms-of-service.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'terms-of-service.html'));
});

// مسار سياسة الخصوصية (Privacy Policy) لمنع خطأ Cannot GET
app.get('/privacy-policy.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'privacy-policy.html'));
});

// ==========================================
// 1. مسارات لوحة الصدارة والنقاط (Leaderboard)
// ==========================================

app.get('/api/leaderboard', (req, res) => {
    res.json(leaderboard);
});

app.post('/api/score/submit', (req, res) => {
    const { username, score } = req.body;

    if (!username || score === undefined) {
        return res.status(400).json({ error: "البيانات المرسلة غير مكتملة" });
    }

    const playerIndex = leaderboard.findIndex(p => p.username === username);
    if (playerIndex !== -1) {
        if (score > leaderboard[playerIndex].score) {
            leaderboard[playerIndex].score = score;
        }
    } else {
        leaderboard.push({ username, score, rank: 0 });
    }

    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.map((player, index) => ({
        ...player,
        rank: index + 1
    })).slice(0, 10);

    res.json({ message: "تم تسجيل النقاط بنجاح", leaderboard });
});

// ==========================================
// 2. مسارات ربط بوابة مدفوعات باي المحمية والمعدلة هندسياً
// ==========================================

// المسار الأول: الموافقة على الدفع (Approve Payment)
app.post('/api/pi/approve', async (req, res) => {
    const { paymentId } = req.body;

    if (!paymentId) {
        return res.status(400).json({ error: "معرف الدفع (Payment ID) مفقود" });
    }

    try {
        console.log(`[Pi API] جاري محاولة إرسال طلب الموافقة للمعاملة: ${paymentId}`);
        
        const response = await axios.post(
            `${PI_API_URL}/payments/${paymentId}/approve`,
            {},
            {
                headers: {
                    'Authorization': `Key ${PI_SERVER_API_KEY.trim()}`, // تنظيف الفراغات الزائدة إن وجدت
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // مهلة 15 ثانية لمنع تعليق الدالة في Vercel
            }
        );

        activePayments[paymentId] = { status: 'approved', timestamp: Date.now() };
        console.log(`[Pi API] تم الموافقة بنجاح على المعاملة: ${paymentId}`);
        
        // إرجاع كائن الدفع الأصلي النقي كما تشترطه خوادم باي لمنع الـ Timeout في الـ SDK
        return res.status(200).json(response.data);

    } catch (error) {
        // حماية حاسمة: الإمساك بخطأ Axios ومنع الـ Serverless من الانهيار (Crash) والـ 500 Error
        console.error("[Pi API Error] حدث خطأ أثناء الموافقة في السيرفر:");
        
        if (error.response) {
            // الطلب وصل لخوادم باي ولكنها ردت برفض (مثل مفتاح API خاطئ أو غير مصرح)
            console.error("تفاصيل رد خادم باي:", error.response.data);
            return res.status(error.response.status).json({
                error: "رفضت خوادم باي الموافقة على المعاملة",
                details: error.response.data
            });
        } else if (error.request) {
            // الطلب أُرسل ولكن لم يصل رد من باي (مشكلة شبكة بين سيرفر Vercel وباي)
            console.error("لم يتم استلام رد من خوادم باي (Network Timeout)");
            return res.status(504).json({ error: "انتهت مهلة الاتصال بخوادم باي الرسمية" });
        } else {
            // خطأ برمجي آخر في إعداد الطلب
            console.error("خطأ عام:", error.message);
            return res.status(500).json({ error: "خطأ داخلي في معالجة الطلب وبناء الهيدرز", message: error.message });
        }
    }
});

// المسار الثاني: إكمال الدفع وصرف الميزة للعميل (Complete Payment)
app.post('/api/pi/complete', async (req, res) => {
    const { paymentId, txid } = req.body;

    if (!paymentId || !txid) {
        return res.status(400).json({ error: "بيانات المعاملة أو الـ Txid مفقودة" });
    }

    try {
        console.log(`[Pi API] جاري إرسال طلب الإغلاق النهائي للمعاملة: ${paymentId}`);
        
        const response = await axios.post(
            `${PI_API_URL}/payments/${paymentId}/complete`,
            { txid: txid },
            {
                headers: {
                    'Authorization': `Key ${PI_SERVER_API_KEY.trim()}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        activePayments[paymentId] = { status: 'completed', txid, timestamp: Date.now() };
        console.log(`[Pi API] تم تسليم العملات وإغلاق الطلب بنجاح: ${paymentId}`);
        
        return res.status(200).json(response.data);

    } catch (error) {
        console.error("[Pi API Error] خطأ أثناء الإكمال المالي في السيرفر:");
        
        if (error.response) {
            console.error("تفاصيل رد خادم باي عند الإكمال:", error.response.data);
            return res.status(error.response.status).json({
                error: "فشلت عملية إكمال المعاملة من طرف خوادم باي",
                details: error.response.data
            });
        } else {
            return res.status(500).json({ error: "فشلت عملية إكمال المعاملة ماليًا بالبلوكشين", message: error.message });
        }
    }
});

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 خادم التحدي التنافسي لـ Pi Arena يعمل على المنفذ: ${PORT}`);
    console.log(`===================================================`);
});
