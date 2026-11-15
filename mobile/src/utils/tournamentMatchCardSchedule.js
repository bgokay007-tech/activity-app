/** Eşleşme kartında müsaitlik / teklif özeti — modal ile aynı scheduleData şekli. */

const DAY_SHORT = {
    en: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' },
    tr: { 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 7: 'Paz' },
    ru: { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' },
    de: { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So' },
};

function formatSlot(slot, lang = 'tr') {
    if (!slot) return '';
    const map = DAY_SHORT[lang] || DAY_SHORT.en;
    const day = slot.date || (slot.weekday != null ? (map[slot.weekday] || String(slot.weekday)) : '');
    return `${day} ${slot.timeFrom || ''}-${slot.timeTo || ''}`.trim();
}

function formatSlots(slots, lang) {
    if (!Array.isArray(slots) || !slots.length) return '';
    return slots.slice(0, 3).map(s => formatSlot(s, lang)).filter(Boolean).join(' · ');
}

/**
 * Kart altında gösterilecek satırlar (React children değil — düz metin listesi).
 * @returns {{ kind: 'agreed'|'suggested'|'avail'|'proposal', text: string, color: string }[]}
 */
export function buildMatchCardScheduleLines(scheduleData, { p1Name, p2Name, lang = 'tr', t = {} } = {}) {
    const sd = scheduleData && typeof scheduleData === 'object' ? scheduleData : null;
    if (!sd) return [];
    const lines = [];
    const agreed = sd.agreed;
    if (agreed) {
        const txt = [agreed.date, `${agreed.timeFrom || ''}-${agreed.timeTo || ''}`, agreed.venueName]
            .filter(Boolean).join(' · ');
        if (txt) lines.push({ kind: 'agreed', text: `📍 ${txt}`, color: '#4ade80' });
    } else {
        const sug = sd.suggested;
        if (sug) {
            const w = Array.isArray(sug.windows) && sug.windows[0];
            const courts = Array.isArray(sug.courts) ? sug.courts.map(c => c.name).filter(Boolean).slice(0, 2) : [];
            const bits = [];
            if (w) bits.push(`${w.date} ${w.timeFrom || ''}-${w.timeTo || ''}`);
            if (courts.length) bits.push(courts.join(' · '));
            if (bits.length) lines.push({ kind: 'suggested', text: `🤝 ${bits.join(' · ')}`, color: '#c4b5fd' });
        }
    }

    const a1 = formatSlots(sd.availability?.p1, lang);
    const a2 = formatSlots(sd.availability?.p2, lang);
    const waiting = t.tournCardAvailWaiting || '—';
    // En az bir taraf bildirdiyse ikisini de göster (boş taraf "henüz yok")
    if (a1 || a2) {
        lines.push({
            kind: 'avail',
            text: `📅 ${p1Name || 'P1'}: ${a1 || waiting}`,
            color: a1 ? '#93c5fd' : '#64748b',
        });
        lines.push({
            kind: 'avail',
            text: `📅 ${p2Name || 'P2'}: ${a2 || waiting}`,
            color: a2 ? '#93c5fd' : '#64748b',
        });
    }

    const proposals = Array.isArray(sd.proposals) ? sd.proposals : [];
    if (proposals.length && !agreed) {
        const latest = [...proposals].reverse().slice(0, 2);
        for (const p of latest) {
            const who = p.side === 'p1' ? (p1Name || 'P1') : (p2Name || 'P2');
            const bit = [p.date, `${p.timeFrom || ''}-${p.timeTo || ''}`, p.venueName].filter(Boolean).join(' · ');
            if (!bit) continue;
            lines.push({
                kind: 'proposal',
                text: `💬 ${(t.tournCardProposalShort || 'Teklif')} (${who}): ${bit}`,
                color: '#fbbf24',
            });
        }
    }

    return lines;
}
