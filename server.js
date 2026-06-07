const express = require('express');
const cors = require('cors');
const axios = require('axios');
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
// 2. مسارات ربط بوابة مدفوعات باي المعدلة هندسياً
// ==========================================

// المسار الأول: الموافقة على الدفع (Approve Payment)
app.post('/api/pi/approve', async (req, res) => {
    const { paymentId } = req.body;

    if (!paymentId) {
        return res.status(400).json({ error: "معرف الدفع (Payment ID) مفقود" });
    }

    try {
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

        activePayments[paymentId] = { status: 'approved', timestamp: Date.now() };
        console.log(`[Pi API] تم الموافقة بنجاح على المعاملة: ${paymentId}`);
        
        // تعديل جوهري: إرجاع كائن الدفع النقي المرجوع من خوادم Pi مباشرة دون غشلفته لمنع الـ Timeout
        return res.status(200).json(response.data);

    } catch (error) {
        console.error("[Pi API Error] خطأ أثناء الموافقة:", error.response ? error.response.data : error.message);
        return res.status(500).json({ error: "فشلت عملية الموافقة من خادم باي الرسمي" });
    }
});

// المسار الثاني: إكمال الدفع وصرف الميزة للعميل (Complete Payment)
app.post('/api/pi/complete', async (req, res) => {
    const { paymentId, txid } = req.body;

    if (!paymentId || !txid) {
        return res.status(400).json({ error: "بيانات المعاملة أو الـ Txid مفقودة" });
    }

    try {
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

        activePayments[paymentId] = { status: 'completed', txid, timestamp: Date.now() };
        console.log(`[Pi API] تم تسليم العملات وإغلاق الطلب بنجاح: ${paymentId}`);
        
        // إرجاع كائن النجاح المكتمل الصادر من خوادم Pi
        return res.status(200).json(response.data);

    } catch (error) {
        console.error("[Pi API Error] خطأ أثناء الإكمال المالي:", error.response ? error.response.data : error.message);
        return res.status(500).json({ error: "فشلت عملية إكمال وإغلاق المعاملة بالبلوكشين" });
    }
});

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 خادم التحدي التنافسي لـ Pi Arena يعمل على المنفذ: ${PORT}`);
    console.log(`===================================================`);
});
