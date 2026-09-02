// Telegram bot rastgele bir kullanıcıyı mesajlayamaz — kullanıcı/işletme botu bir kere
// başlatıp (deep link ile /start <token>) hesabını bağlamalı. Bu dosya hem bağlama akışını
// (link token üretme) hem de Telegram'ın bize POST ettiği webhook'u yönetir.
import crypto from 'crypto';
import axios from 'axios';
import prisma from '../config/prisma.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

export const createLinkToken = async (req, res, next) => {
    try {
        const token = crypto.randomBytes(16).toString('hex');
        await prisma.user.update({ where: { id: req.userId }, data: { telegramLinkToken: token } });
        res.json({
            token,
            botConfigured: !!TELEGRAM_BOT_USERNAME,
            deepLink: TELEGRAM_BOT_USERNAME ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}` : null,
        });
    } catch (error) { next(error); }
};

export const unlinkTelegram = async (req, res, next) => {
    try {
        await prisma.user.update({ where: { id: req.userId }, data: { telegramChatId: null, telegramLinkToken: null } });
        res.json({ ok: true });
    } catch (error) { next(error); }
};

async function sendTelegramReply(chatId, text) {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: chatId, text });
    } catch { /* non-critical */ }
}

// Telegram'ın bize POST ettiği webhook — sadece "/start <token>" mesajını işler, geri kalanı yutar.
// Telegram her zaman 200 bekliyor; 200 dönmezsek aynı update'i tekrar tekrar dener.
export const telegramWebhook = async (req, res) => {
    try {
        const message = req.body?.message;
        const text = message?.text || '';
        const chatId = message?.chat?.id;
        const match = text.match(/^\/start(?:@\S+)?\s+(\S+)/);
        if (match && chatId) {
            const token = match[1];
            const user = await prisma.user.findUnique({ where: { telegramLinkToken: token } });
            if (user) {
                await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: String(chatId), telegramLinkToken: null } });
                await sendTelegramReply(chatId, '✅ Telegram hesabınız AcTiViTy ile bağlandı. Seçtiğiniz bildirimler bundan sonra buraya da gelecek.');
            } else {
                await sendTelegramReply(chatId, 'Bağlantı kodu geçersiz veya süresi dolmuş — uygulamadan yeni bir bağlantı kodu alıp tekrar deneyin.');
            }
        }
    } catch { /* non-critical */ }
    res.sendStatus(200);
};
