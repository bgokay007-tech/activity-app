// Tenis/padel puanlama simülasyonu — SEVİYE A (saf puanlama, veritabanı GEREKTİRMEZ).
//
// Amaç (kullanıcı isteği): "0'dan 5'e kadar bütün kullanıcıları tekli/çiftli eşleştirip
// maç yaptırmak, bir düşük seviye bir yüksek seviye kazanarak ELO değişimini görmek" —
// elle tek tek ilan açıp maç oluşturmak yerine tüm kombinasyonları script ile taramak.
//
// Puanlama mantığı burada yeniden yazılmaz; scripts/lib/utrSimModel.js üzerinden
// utrRating.js'in kendi saf fonksiyonları kullanılır. Bu modelin gerçek (veritabanlı)
// motorla aynı sonucu verdiği simulateTennisMatchesE2E.js B2 bölümünde doğrulanır.
//
// Üç mod:
//   izole      — her maçta oyuncular sıfırlanır. "Şu puan farkında, şu skorla, şu taraf
//                kazanınca puan ne kadar değişir" tablosu. Tek maçın saf etkisi.
//   birikimli  — aynı oyuncular seri maç oynar. Puanların nereye yakınsadığını gösterir
//                (UTR mantığı sabit delta biriktirmez, son 12 ay/30 maçtan yeniden hesaplar).
//   koruma     — kalibrasyon koruması AÇIK (oyuncu anketini yeni doldurmuş): düşük puanlının
//                kendinden ≥1.0 yüksek rakibi yendiği maçlar ELO'ya hiç sayılmaz.
//
// Çalıştır (backend/ içinden):
//   node scripts/simulateTennisElo.js
//   node scripts/simulateTennisElo.js --singles-step=0.1 --doubles-step=0.5 --series=30
//
// Çıktı: scripts/out/ altına CSV + konsola özet tablo.
import fs from 'fs';
import path from 'path';
import {
    SCORES, GRACE_MATCHES, mkPlayer, playMatch, range, avg, r4, writeCsv,
} from './lib/utrSimModel.js';

const arg = (name, def) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : def;
};
const SINGLES_STEP = parseFloat(arg('singles-step', '0.1'));
const DOUBLES_STEP = parseFloat(arg('doubles-step', '0.5'));
const SERIES_LEN = parseInt(arg('series', '30'), 10);
const OUT_DIR = path.join(import.meta.dirname, 'out');

// ─── İZOLE MOD ────────────────────────────────────────────────────────────────
// Her satır tek bir maç; oyuncular o maç için sıfırdan yaratılır (geçmiş yok).

function runSinglesIsolated({ graceMatches }) {
    const values = range(0, 5, SINGLES_STEP);
    const rows = [];
    for (const a of values) {
        for (const b of values) {
            for (const score of SCORES) {
                for (const winnerIsLower of [true, false]) {
                    const lower = Math.min(a, b), higher = Math.max(a, b);
                    const winnerSeed = winnerIsLower ? lower : higher;
                    const loserSeed = winnerIsLower ? higher : lower;
                    if (winnerSeed === loserSeed && !winnerIsLower) continue; // eşit puanda tek satır yeter
                    const w = mkPlayer(winnerSeed, { graceMatches });
                    const l = mkPlayer(loserSeed, { graceMatches });
                    const res = playMatch([w], [l], score);
                    rows.push({
                        format: 'TEKLI',
                        kazanan_puan: winnerSeed,
                        kaybeden_puan: loserSeed,
                        puan_farki: r4(Math.abs(winnerSeed - loserSeed)),
                        kazanan_dusuk_seviye: winnerIsLower && winnerSeed !== loserSeed ? 'EVET' : 'HAYIR',
                        skor: score.label,
                        elo_atlandi: res.skipped ? 'EVET' : 'HAYIR',
                        kazanan_once: winnerSeed,
                        kazanan_sonra: res.skipped ? winnerSeed : res.changes[0].after,
                        kazanan_degisim: res.skipped ? 0 : res.changes[0].change,
                        kaybeden_once: loserSeed,
                        kaybeden_sonra: res.skipped ? loserSeed : res.changes[1].after,
                        kaybeden_degisim: res.skipped ? 0 : res.changes[1].change,
                    });
                }
            }
        }
    }
    return rows;
}

function runDoublesIsolated() {
    const values = range(0, 5, DOUBLES_STEP);
    const rows = [];
    // Çiftlerde 4 oyuncu → değer sayısının 4. kuvveti. Takım içi sıra önemsiz olduğu için
    // (w1≤w2, l1≤l2) yarısı atlanır; adımı 0.5 tutmak bunu yönetilebilir kılıyor.
    for (const w1 of values) {
        for (const w2 of values) {
            if (w2 < w1) continue;
            for (const l1 of values) {
                for (const l2 of values) {
                    if (l2 < l1) continue;
                    for (const score of SCORES) {
                        const winners = [mkPlayer(w1), mkPlayer(w2)];
                        const losers = [mkPlayer(l1), mkPlayer(l2)];
                        const winAvg = r4(avg([w1, w2])), loseAvg = r4(avg([l1, l2]));
                        const res = playMatch(winners, losers, score);
                        rows.push({
                            format: 'CIFTLI',
                            kazanan_takim: `${w1}+${w2}`,
                            kaybeden_takim: `${l1}+${l2}`,
                            kazanan_ort: winAvg,
                            kaybeden_ort: loseAvg,
                            puan_farki: r4(Math.abs(winAvg - loseAvg)),
                            kazanan_dusuk_seviye: winAvg < loseAvg ? 'EVET' : 'HAYIR',
                            skor: score.label,
                            elo_atlandi: res.skipped ? 'EVET' : 'HAYIR',
                            w1_degisim: res.skipped ? 0 : res.changes[0].change,
                            w2_degisim: res.skipped ? 0 : res.changes[1].change,
                            l1_degisim: res.skipped ? 0 : res.changes[2].change,
                            l2_degisim: res.skipped ? 0 : res.changes[3].change,
                            w1_sonra: res.skipped ? w1 : res.changes[0].after,
                            w2_sonra: res.skipped ? w2 : res.changes[1].after,
                            l1_sonra: res.skipped ? l1 : res.changes[2].after,
                            l2_sonra: res.skipped ? l2 : res.changes[3].after,
                        });
                    }
                }
            }
        }
    }
    return rows;
}

// ─── BİRİKİMLİ MOD ────────────────────────────────────────────────────────────
// Aynı oyuncu çifti üst üste maç oynar — puan nereye yakınsıyor?

function runAccumulated() {
    const seeds = range(0, 5, 0.5);
    const rows = [];
    for (const wSeed of seeds) {
        for (const lSeed of seeds) {
            for (const score of [SCORES[0], SCORES[1]]) {
                const w = mkPlayer(wSeed);
                const l = mkPlayer(lSeed);
                for (let i = 1; i <= SERIES_LEN; i++) {
                    const res = playMatch([w], [l], score);
                    rows.push({
                        format: 'TEKLI_SERI',
                        kazanan_seed: wSeed,
                        kaybeden_seed: lSeed,
                        skor: score.label,
                        mac_no: i,
                        elo_atlandi: res.skipped ? 'EVET' : 'HAYIR',
                        kazanan_puan: w.rating,
                        kaybeden_puan: l.rating,
                    });
                }
            }
        }
    }
    return rows;
}

// ─── Özetler ──────────────────────────────────────────────────────────────────

function summarizeSingles(rows) {
    const buckets = [0, 0.25, 0.5, 1, 1.5, 2, 3, 5.01];
    const label = (d) => {
        for (let i = 0; i < buckets.length - 1; i++) {
            if (d >= buckets[i] && d < buckets[i + 1]) return `${buckets[i]}–${buckets[i + 1]}`;
        }
        return '5+';
    };
    const acc = new Map();
    for (const r of rows) {
        if (r.elo_atlandi === 'EVET') continue;
        const key = `${label(r.puan_farki)}|${r.kazanan_dusuk_seviye}|${r.skor}`;
        const cur = acc.get(key) || { n: 0, win: 0, lose: 0 };
        cur.n += 1; cur.win += r.kazanan_degisim; cur.lose += r.kaybeden_degisim;
        acc.set(key, cur);
    }
    const out = [];
    for (const [key, v] of acc) {
        const [fark, dusukKazandi, skor] = key.split('|');
        out.push({
            puan_farki_araligi: fark,
            kazanan_dusuk_seviye: dusukKazandi,
            skor,
            ornek_sayisi: v.n,
            kazanan_ort_degisim: r4(v.win / v.n),
            kaybeden_ort_degisim: r4(v.lose / v.n),
        });
    }
    return out.sort((a, b) => a.puan_farki_araligi.localeCompare(b.puan_farki_araligi) || a.skor.localeCompare(b.skor));
}

// Ürün açısından en kritik çıktı: maçı KAZANDIĞI halde puanı DÜŞEN ya da KAYBETTİĞİ halde
// puanı ARTAN oyuncular. UTR mantığında matematiksel olarak mümkün (beklenenden kötü
// kazanmak/iyi kaybetmek) ama kullanıcı gözünde "kazandım, puanım düştü" şikâyeti üretir.
function findAnomalies(rows) {
    return rows.filter(r => r.elo_atlandi === 'HAYIR' && (r.kazanan_degisim < 0 || r.kaybeden_degisim > 0));
}

// Depolanan puanın 0'ın altına inip inmediği — getDisplayRating okuma anında Math.max(0,…)
// uyguluyor, yani ekranda 0 görünür; ama veritabanında negatif duruyorsa sonraki
// hesaplar bu negatif değerden başlar.
function findNegatives(rows) {
    return rows.filter(r => r.kazanan_sonra < 0 || r.kaybeden_sonra < 0);
}

function main() {
    const t0 = Date.now();
    console.log('=== Tenis/Padel ELO Simülasyonu — Seviye A (saf puanlama) ===');
    console.log(`Tekli adım: ${SINGLES_STEP} | Çiftli adım: ${DOUBLES_STEP} | Seri uzunluğu: ${SERIES_LEN}\n`);

    const singles = runSinglesIsolated({ graceMatches: GRACE_MATCHES });
    console.log(`İzole TEKLI maç (kalibrasyon koruması kapalı): ${singles.length.toLocaleString('tr-TR')}`);
    const singlesGrace = runSinglesIsolated({ graceMatches: 0 });
    console.log(`İzole TEKLI maç (koruma AÇIK, yeni oyuncu):     ${singlesGrace.length.toLocaleString('tr-TR')}`);
    const doubles = runDoublesIsolated();
    console.log(`İzole CIFTLI maç: ${doubles.length.toLocaleString('tr-TR')}`);
    const series = runAccumulated();
    console.log(`Birikimli seri satırı: ${series.length.toLocaleString('tr-TR')}`);

    const summary = summarizeSingles(singles);
    const anomalies = findAnomalies(singles);
    const negatives = findNegatives(singles);
    const skippedByGrace = singlesGrace.filter(r => r.elo_atlandi === 'EVET');

    const files = [
        writeCsv(OUT_DIR, 'A1_tekli_izole.csv', singles, fs, path),
        writeCsv(OUT_DIR, 'A2_ciftli_izole.csv', doubles, fs, path),
        writeCsv(OUT_DIR, 'A3_tekli_birikimli_seri.csv', series, fs, path),
        writeCsv(OUT_DIR, 'A4_ozet_tekli.csv', summary, fs, path),
        writeCsv(OUT_DIR, 'A5_kalibrasyon_korumasi.csv', singlesGrace, fs, path),
        writeCsv(OUT_DIR, 'A6_anomaliler.csv', anomalies, fs, path),
    ].filter(Boolean);

    console.log('\n--- ÖZET: tekli, kazananın ortalama puan değişimi ---');
    console.table(summary.filter(s => s.skor.startsWith('6-0') || s.skor.startsWith('6-4 7-5')));

    console.log(`\n--- BULGU 1: kazandığı halde puanı düşen / kaybettiği halde artan maç: ${anomalies.length.toLocaleString('tr-TR')} / ${singles.length.toLocaleString('tr-TR')} ---`);
    console.table(anomalies.slice(0, 8).map(a => ({
        kazanan: a.kazanan_puan, kaybeden: a.kaybeden_puan, skor: a.skor,
        kazanan_degisim: a.kazanan_degisim, kaybeden_degisim: a.kaybeden_degisim,
    })));

    console.log(`\n--- BULGU 2: puanı 0'ın ALTINA inen maç: ${negatives.length.toLocaleString('tr-TR')} ---`);
    if (negatives.length > 0) {
        console.table(negatives.slice(0, 5).map(n => ({
            kazanan: n.kazanan_puan, kaybeden: n.kaybeden_puan, skor: n.skor,
            kazanan_sonra: n.kazanan_sonra, kaybeden_sonra: n.kaybeden_sonra,
        })));
    }

    console.log(`\n--- BULGU 3: kalibrasyon koruması aktifken ELO'ya hiç sayılmayan maç: ${skippedByGrace.length.toLocaleString('tr-TR')} / ${singlesGrace.length.toLocaleString('tr-TR')} ---`);
    console.log('   (anketini yeni doldurmuş oyuncu, kendinden ≥1.0 yüksek rakibi yenince maç geçersiz + ankete geri yönlendirme)');

    console.log('\n--- Birikimli örnek: seed 0.5 oyuncu, 2.5 oyuncuyu sürekli 6-0 6-1 yenerse ---');
    const sample = series.filter(r => r.kazanan_seed === 0.5 && r.kaybeden_seed === 2.5 && r.skor === SCORES[0].label);
    console.table(sample.filter(r => [1, 2, 3, 5, 10, 20, 30].includes(r.mac_no))
        .map(r => ({ mac_no: r.mac_no, kazanan_puan: r.kazanan_puan, kaybeden_puan: r.kaybeden_puan })));

    console.log('\nCSV dosyaları:');
    for (const f of files) console.log('  ' + f);
    console.log(`\nSüre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
}

main();
