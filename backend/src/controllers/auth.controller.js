import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import twilio from 'twilio';
import prisma from '../config/prisma.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const sendSmsOtp = async (to, code) => {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
        body: `AcTiViTy doğrulama kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir.`,
        from: process.env.TWILIO_PHONE,
        to,
    });
};

const sendEmailOtp = async (to, code) => {
    const { error } = await resend.emails.send({
        from: 'AcTiViTy <onboarding@resend.dev>',
        to,
        subject: 'AcTiViTy – Doğrulama Kodunuz',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;background:#0f0f0f;padding:32px;border-radius:16px;">
          <h1 style="color:#a855f7;font-size:28px;margin:0 0 8px;">AcTiViTy</h1>
          <p style="color:#9ca3af;font-size:14px;margin:0 0 28px;">Sosyal Spor Platformu</p>
          <p style="color:#e5e7eb;font-size:15px;margin:0 0 16px;">Hesabınızı doğrulamak için aşağıdaki kodu kullanın:</p>
          <div style="background:#1f1f1f;border:2px solid #a855f7;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#a855f7;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:13px;">Bu kod <strong>10 dakika</strong> geçerlidir. Eğer bu isteği siz yapmadıysanız görmezden gelebilirsiniz.</p>
        </div>`,
    });
    if (error) throw new Error(error.message);
};

const generateToken = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// In-memory OTP store: key → { code, expiresAt, verified }
const otpStore = new Map();
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export const sendOtp = async (req, res, next) => {
    try {
        const { method, value, username, email, phone } = req.body;
        if (!method || !value) return res.status(400).json({ message: 'method ve value gerekli' });

        // Early duplicate check for username + both contacts
        const orConditions = [];
        if (username) orConditions.push({ username });
        if (email) orConditions.push({ email });
        if (phone) orConditions.push({ phone });
        // also check the OTP target itself
        if (method === 'email' && !email) orConditions.push({ email: value });
        if (method === 'phone' && !phone) orConditions.push({ phone: value });

        if (orConditions.length > 0) {
            const existing = await prisma.user.findFirst({ where: { OR: orConditions } });
            if (existing) {
                if (existing.username === username) return res.status(409).json({ message: 'Bu kullanıcı adı zaten kullanılıyor' });
                if (existing.email && existing.email === email) return res.status(409).json({ message: 'Bu e-posta zaten kayıtlı' });
                if (existing.phone && existing.phone === phone) return res.status(409).json({ message: 'Bu telefon numarası zaten kayıtlı' });
                return res.status(409).json({ message: 'Bu bilgiler zaten kayıtlı' });
            }
        }

        const code = generateOtp();
        const key = `${method}:${value}`;
        otpStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, verified: false });

        console.log(`[OTP] ${key} → ${code}`);

        const resendReady = !!process.env.RESEND_API_KEY;

        let emailSent = false;
        if (method === 'email') {
            if (resendReady) {
                try {
                    await sendEmailOtp(value, code);
                    emailSent = true;
                } catch (mailErr) {
                    console.error('[OTP Mail Error]', mailErr.message);
                    // SMTP bloke veya credential hatası — devCode moduna düş
                }
            }
            if (!emailSent) {
                console.log(`[OTP DEV] ${value} → ${code}`);
            }
        } else if (method === 'phone') {
            return res.status(503).json({ message: 'SMS doğrulaması şu an aktif değil. Lütfen e-posta ile doğrulama yapın.' });
        }

        res.json({
            message: emailSent ? 'OTP gönderildi' : 'OTP oluşturuldu (geliştirici modu)',
            ...(!emailSent && { devCode: code }),
        });
    } catch (error) {
        next(error);
    }
};

export const verifyOtp = async (req, res, next) => {
    try {
        const { method, value, code } = req.body;
        if (!method || !value || !code) return res.status(400).json({ message: 'Eksik parametre' });

        const key = `${method}:${value}`;
        const entry = otpStore.get(key);

        if (!entry || Date.now() > entry.expiresAt) {
            return res.status(400).json({ message: 'OTP süresi dolmuş, yeniden gönder' });
        }
        if (entry.code !== String(code)) {
            return res.status(400).json({ message: 'Yanlış doğrulama kodu' });
        }

        otpStore.set(key, { ...entry, verified: true });
        res.json({ verified: true });
    } catch (error) {
        next(error);
    }
};

export const register = async (req, res, next) => {
    try {
        const { email, phone, username, password, fullName, gender, birthDate } = req.body;

        if (!email && !phone) return res.status(400).json({ message: 'E-posta veya telefon gerekli' });
        if (!username || !password) return res.status(400).json({ message: 'Kullanıcı adı ve şifre gerekli' });

        // Verify OTP was completed
        const method = email ? 'email' : 'phone';
        const value = email || phone;
        const key = `${method}:${value}`;
        const entry = otpStore.get(key);

        if (!entry?.verified) {
            return res.status(400).json({ message: 'Doğrulama tamamlanmadı' });
        }

        // Check duplicates
        const orConditions = [{ username }];
        if (email) orConditions.push({ email });
        if (phone) orConditions.push({ phone });

        const existing = await prisma.user.findFirst({ where: { OR: orConditions } });
        if (existing) {
            return res.status(409).json({ message: 'Kullanıcı adı, e-posta veya telefon zaten kayıtlı' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const { country, city } = req.body;

        const user = await prisma.user.create({
            data: {
                email: email || null,
                phone: phone || null,
                username,
                password: hashedPassword,
                fullName: fullName || null,
                gender: gender || null,
                birthDate: birthDate ? new Date(birthDate) : null,
                country: country || null,
                city: city || null,
            },
            select: {
                id: true, email: true, phone: true, username: true,
                fullName: true, gender: true, birthDate: true, country: true, city: true, createdAt: true,
            },
        });

        otpStore.delete(key);
        const token = generateToken(user.id);
        res.status(201).json({ user, token });
    } catch (error) {
        next(error);
    }
};

export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Geçersiz kimlik bilgileri' });
        }

        const token = generateToken(user.id);
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword, token });
    } catch (error) {
        next(error);
    }
};

export const getMe = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true, email: true, phone: true, username: true,
                fullName: true, avatar: true, bio: true, gender: true,
                birthDate: true, createdAt: true, city: true, country: true,
                isPublic: true,
                profilePrivacy: true, profileExclude: true,
                fullNamePrivacy: true, fullNameExclude: true,
                cityPrivacy: true, genderPrivacy: true, birthDatePrivacy: true,
                cityExclude: true, genderExclude: true, birthDateExclude: true,
                interests: { include: { skills: true } },
                cards: true,
                _count: { select: { posts: true, sentFriendReqs: { where: { status: 'ACCEPTED' } }, receivedFriendReqs: { where: { status: 'ACCEPTED' } } } },
            },
        });
        res.json(user);
    } catch (error) {
        next(error);
    }
};
