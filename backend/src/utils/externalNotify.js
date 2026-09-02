// Kişisel "Veri Tasarrufu" / işletme ayarındaki ek bildirim kanalı — kullanıcı uygulama içi
// bildirimlere EK olarak WhatsApp/SMS (Twilio), Telegram (kendi botumuz) ya da e-posta (Brevo)
// üzerinden de otomatik mesaj almayı seçebilir. İlgili kimlik bilgisi env'de yoksa (henüz
// kurulmadıysa) o kanal sessizce atlanır — asla "gönderildi" gibi davranmayız.
import axios from 'axios';
import prisma from '../config/prisma.js';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SMS_FROM = process.env.TWILIO_PHONE;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // ör. 'whatsapp:+14155238886'
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

async function sendViaEmail(to, title, body) {
    if (!BREVO_API_KEY || !to) return;
    try {
        await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: { name: 'AcTiViTy', email: 'b.gokay007@gmail.com' },
            to: [{ email: to }],
            subject: title,
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;background:#0f0f0f;padding:32px;border-radius:16px;">
  <h1 style="color:#a855f7;font-size:22px;margin:0 0 16px;">AcTiViTy</h1>
  <p style="color:#e5e7eb;font-size:15px;margin:0 0 8px;font-weight:700;">${title}</p>
  <p style="color:#9ca3af;font-size:14px;">${body}</p>
</div>`,
        }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 8000 });
    } catch (e) { console.error('[externalNotify] email failed:', e.message); }
}

async function sendViaTwilio(to, body, whatsapp) {
    const from = whatsapp ? TWILIO_WHATSAPP_FROM : TWILIO_SMS_FROM;
    if (!TWILIO_SID || !TWILIO_AUTH || !from || !to) return;
    try {
        const params = new URLSearchParams({
            To: whatsapp ? `whatsapp:${to}` : to,
            From: from,
            Body: body,
        });
        await axios.post(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
            params,
            { auth: { username: TWILIO_SID, password: TWILIO_AUTH }, timeout: 8000 }
        );
    } catch (e) { console.error(`[externalNotify] ${whatsapp ? 'whatsapp' : 'sms'} failed:`, e.message); }
}

async function sendViaTelegram(chatId, title, body) {
    if (!TELEGRAM_BOT_TOKEN || !chatId) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `*${title}*\n${body}`,
            parse_mode: 'Markdown',
        }, { timeout: 8000 });
    } catch (e) { console.error('[externalNotify] telegram failed:', e.message); }
}

// createNotification'dan (notification.controller.js) çağrılır — fire-and-forget, hiçbir
// hata ana bildirim akışını etkilemez. extraNotifyPhone/Email boşsa hesabın kendi phone/email
// alanına düşer (bkz. schema.prisma User.extraNotifyChannel yorumu).
export async function sendExternalNotification(userId, title, body) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { extraNotifyChannel: true, extraNotifyPhone: true, extraNotifyEmail: true, telegramChatId: true, phone: true, email: true },
        });
        if (!user?.extraNotifyChannel) return;
        switch (user.extraNotifyChannel) {
            case 'EMAIL': return sendViaEmail(user.extraNotifyEmail || user.email, title, body);
            case 'SMS': return sendViaTwilio(user.extraNotifyPhone || user.phone, `${title}\n${body}`, false);
            case 'WHATSAPP': return sendViaTwilio(user.extraNotifyPhone || user.phone, `${title}\n${body}`, true);
            case 'TELEGRAM': return sendViaTelegram(user.telegramChatId, title, body);
        }
    } catch { /* non-critical */ }
}
