const TRAIT_KEYS = ['extraversion', 'openness', 'conscientiousness', 'agreeableness', 'emotionalStability'];

function jaccard(a = [], b = []) {
    const setA = new Set(a);
    const setB = new Set(b);
    if (setA.size === 0 && setB.size === 0) return 0;
    let intersection = 0;
    for (const v of setA) if (setB.has(v)) intersection++;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

function traitSimilarity(traitsA = {}, traitsB = {}) {
    let sumSqDiff = 0;
    for (const key of TRAIT_KEYS) {
        const a = traitsA[key] ?? 50;
        const b = traitsB[key] ?? 50;
        sumSqDiff += ((a - b) / 100) ** 2;
    }
    const distance = Math.sqrt(sumSqDiff / TRAIT_KEYS.length);
    return 1 - distance; // 0..1, 1 = özdeş
}

// Not: dealbreakers (aiProfile.dealbreakers) şu an sadece "ben bunları istemiyorum" bilgisini
// tutuyor — karşı tarafın bu özelliklere sahip olup olmadığını belirten bir kendini-tanımlama
// alanı anket'te henüz yok, bu yüzden sert bir eleme burada uygulanmıyor (yanlış pozitif/negatif
// üretecek bir eşleşme olurdu). v2'de karşılıklı kontrol için ayrı bir "selfAttributes" alanı eklenebilir.

// profileA/profileB: FriendFindingProfile.aiProfile JSON şeması (bkz. friendFindingAi.js)
// seekingA/seekingB: 'FRIENDS' | 'PARTNER' | 'BOTH' — ilişki hedefi karşılaştırması sadece ikisi de partner arıyorsa dahil edilir
// Dönüş: 0..100 arası uyumluluk skoru
export function computeCompatibility(profileA, profileB, seekingA, seekingB) {
    if (!profileA || !profileB) return 0;

    const traitScore = traitSimilarity(profileA.traits, profileB.traits);
    const interestScore = jaccard(profileA.interests, profileB.interests);

    const bothWantPartner = seekingA !== 'FRIENDS' && seekingB !== 'FRIENDS';
    const goalScore = bothWantPartner ? jaccard(profileA.relationshipGoals, profileB.relationshipGoals) : 0.5;

    const commStyleScore = profileA.communicationStyle && profileA.communicationStyle === profileB.communicationStyle ? 1 : 0.4;

    const weighted =
        traitScore * 0.40 +
        interestScore * 0.30 +
        goalScore * 0.15 +
        commStyleScore * 0.15;

    return Math.round(weighted * 100);
}
