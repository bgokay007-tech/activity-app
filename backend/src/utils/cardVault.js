import crypto from 'crypto';

const MAX_CARDS = 8;

function key() {
    const raw = process.env.PAYMENT_CARD_KEY || process.env.JWT_SECRET || 'activity-card-dev-key';
    return crypto.createHash('sha256').update(String(raw)).digest();
}

export function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}

export function luhnOk(num) {
    if (!/^\d{13,19}$/.test(num)) return false;
    let sum = 0;
    let alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
        let n = num.charCodeAt(i) - 48;
        if (alt) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
    }
    return sum % 10 === 0;
}

export function brandOf(num) {
    if (/^4/.test(num)) return 'VISA';
    if (/^(5[1-5]|2[2-7])/.test(num)) return 'MASTERCARD';
    if (/^3[47]/.test(num)) return 'AMEX';
    if (/^9792/.test(num)) return 'TROY';
    return 'CARD';
}

export function panHash(digits) {
    return crypto.createHmac('sha256', key()).update(digits).digest('hex');
}

export function sealPan(digits) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
    return {
        panCipher: enc.toString('base64'),
        panIv: iv.toString('base64'),
        panTag: cipher.getAuthTag().toString('base64'),
    };
}

// Yalnızca ileride sunucu tarafı tahsilat kullanır. İstemciye hiç dönmez.
export function openPan(row) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(row.panIv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.panTag, 'base64'));
    const plain = Buffer.concat([
        decipher.update(Buffer.from(row.panCipher, 'base64')),
        decipher.final(),
    ]);
    return plain.toString('utf8');
}

export function parseExpiry(month, year) {
    const m = Number(month);
    let y = Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12) return null;
    if (!Number.isInteger(y)) return null;
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2099) return null;
    const end = new Date(y, m, 0, 23, 59, 59);
    return { month: m, year: y, expired: end < new Date() };
}

export function validHolder(name) {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 80) return null;
    if (!/^[\p{L}][\p{L} .'-]*$/u.test(n)) return null;
    return n;
}

export { MAX_CARDS };
