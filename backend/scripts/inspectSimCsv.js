// Simülasyon CSV'lerinden belirli satırları hızlıca okumak için küçük yardımcı.
// Örnek: node scripts/inspectSimCsv.js A1_tekli_izole.csv
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join(import.meta.dirname, 'out');

export function readCsv(name) {
    const raw = fs.readFileSync(path.join(OUT_DIR, name), 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split('\n').filter(l => l.trim());
    const cols = lines[1].split(';'); // lines[0] = 'sep=;'
    return lines.slice(2).map(l => {
        const v = l.split(';').map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
        return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    });
}

function main() {
    const rows = readCsv('A1_tekli_izole.csv');
    const ezici = (r) => r.skor.startsWith('6-0 6-1');
    const show = (w, l) => {
        for (const r of rows.filter(r => +r.kazanan_puan === w && +r.kaybeden_puan === l && ezici(r))) {
            console.log(`  kazanan ${w} vs kaybeden ${l} | kazanan ${r.kazanan_degisim} -> ${r.kazanan_sonra} | kaybeden ${r.kaybeden_degisim} -> ${r.kaybeden_sonra}`);
        }
    };
    console.log('DÜŞÜK SEVİYE KAZANIYOR (6-0 6-1):'); show(0, 5); show(0, 2.5); show(1, 3);
    console.log('\nYÜKSEK SEVİYE KAZANIYOR (6-0 6-1):'); show(5, 0); show(2.5, 0); show(3, 1);
    console.log('\nYAKIN SEVİYE (6-0 6-1):'); show(2.5, 2.4); show(2.5, 2.5);
}

if (process.argv[1] && process.argv[1].endsWith('inspectSimCsv.js')) main();
