// Maç COMPLETED olduktan sonra skor girilmezse otomatik 0-0 (autoDrawUnscored).
// Kullanıcı isteği: 4 saat → 12 saat. extendScoreDeadline da aynı pencereyi kullanır.
export const SCORE_ENTRY_WINDOW_HOURS = 12;
export const SCORE_ENTRY_WINDOW_MS = SCORE_ENTRY_WINDOW_HOURS * 60 * 60 * 1000;
