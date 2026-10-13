import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

export function probeDuration(input) {
    return new Promise((resolve) => {
        const ff = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-i', input], { stdio: ['ignore', 'ignore', 'pipe'] });
        let txt = '';
        ff.stderr.on('data', d => { txt += d.toString(); });
        ff.on('error', () => resolve(0));
        ff.on('close', () => {
            const m = txt.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
            resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
        });
    });
}

// ffmpeg ile kareleri ham piksel olarak akıt. Çıkış boyutu stderr'deki "Output #0" satırından
// okunur (uzun kenar = longSide, oran korunur, döndürme meta verisi ffmpeg tarafından uygulanır —
// yani kare, telefonda oynatılan görüntüyle aynı yönde; kalibrasyon dokunuşları da o görüntü üzerinde).
const ROTATE_VF = { cw: 'transpose=1,', ccw: 'transpose=2,', '180': 'hflip,vflip,' };

// rotate: kort yan yatık kaydedildiyse (dikey kilitli uygulama + yatay tutulan telefon)
// kareyi "yukarı = uzak dip çizgi" olacak şekilde çevir; top sekme mantığı yerçekimini aşağı varsayar.
export function decodeFrames({ input, fps, longSide, pixFmt = 'gray', rotate = null, onInfo, onFrame }) {
    return new Promise((resolve, reject) => {
        const vf = `${ROTATE_VF[rotate] || ''}fps=${fps},scale=w='if(gte(iw,ih),${longSide},-2)':h='if(gte(iw,ih),-2,${longSide})'`;
        const args = ['-hide_banner', '-nostdin', '-loglevel', 'info', '-i', input, '-an', '-sn', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', pixFmt, 'pipe:1'];
        const ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const bpp = pixFmt === 'rgb24' ? 3 : pixFmt === 'yuv420p' ? 1.5 : 1;
        let errText = '';
        let width = 0, height = 0, frameSize = 0, duration = 0;
        let pending = [];
        let pendingLen = 0;
        let idx = 0;
        let failed = null;

        const tryInfo = () => {
            if (frameSize) return;
            const dm = errText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
            if (dm) duration = (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]);
            const out = errText.indexOf('Output #0');
            if (out < 0) return;
            const m = errText.slice(out).match(/rawvideo[^\n]*?,\s*(\d{2,5})x(\d{2,5})/);
            if (!m) return;
            width = +m[1]; height = +m[2];
            frameSize = width * height * bpp;
            onInfo?.({ width, height, duration, fps });
        };

        const drain = () => {
            if (!frameSize || failed) return;
            while (pendingLen >= frameSize) {
                const buf = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingLen);
                const frame = Buffer.from(buf.subarray(0, frameSize));
                const rest = buf.subarray(frameSize);
                pending = rest.length ? [rest] : [];
                pendingLen = rest.length;
                try { onFrame(frame, idx++); } catch (e) { failed = e; ff.kill('SIGKILL'); return; }
            }
        };

        ff.stderr.on('data', (d) => {
            if (errText.length < 200000) errText += d.toString();
            if (!frameSize) { tryInfo(); drain(); }
        });
        ff.stdout.on('data', (d) => {
            pending.push(d);
            pendingLen += d.length;
            drain();
        });
        ff.on('error', reject);
        ff.on('close', (code) => {
            if (failed) return reject(failed);
            tryInfo(); drain();
            if (code !== 0 && idx === 0) return reject(new Error(`ffmpeg hata (${code}): ${errText.slice(-600)}`));
            resolve({ width, height, duration, frames: idx, fps });
        });
    });
}
