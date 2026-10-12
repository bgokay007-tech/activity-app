import { runDefiMaintenance } from '../controllers/defiLeague.controller.js';

export function startDefiLeagueJob() {
    const tick = () => runDefiMaintenance().catch(err => console.error('[defi-job]', err.message));
    tick();
    setInterval(tick, 10 * 60 * 1000);
    console.log('🪜 Defi league job started (every 10 min)');
}
