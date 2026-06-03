import app from './app.js';
import { PORT } from './config/env.js';

app.listen(PORT, () => {
    console.log(`🎯 AcTiViTy API running on http://localhost:${PORT}`);
});