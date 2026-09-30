// "Koşu & Yürüyüş" birleşik dalı (id 'running') — etkinliğin türü extreme_sports gibi
// `surface` alanında taşınır; rotalar ise türün kendi dalıyla (running/walking/hiking)
// kaydedilir ki eski yürüyüş/doğa yürüyüşü rotaları da aynı Rotalar sekmesinde görünsün.
export const RUN_ACTIVITY_TYPES = [
    { id: 'RUN',  key: 'runTypeRun',  emoji: '🏃', trailSub: 'running' },
    { id: 'WALK', key: 'runTypeWalk', emoji: '🚶', trailSub: 'walking' },
    { id: 'HIKE', key: 'runTypeHike', emoji: '🥾', trailSub: 'hiking' },
];

export const RUN_TRAIL_SUBS = RUN_ACTIVITY_TYPES.map(x => x.trailSub);

export const trailEmoji = (subCategory) =>
    RUN_ACTIVITY_TYPES.find(x => x.trailSub === subCategory)?.emoji || '🥾';
