// Arkadaş Bulma anketi — puanlama yok, cevaplar doğrudan AI'a (Claude) gönderilir.
// `type: 'choice'` seçenekli, `type: 'text'` serbest metin sorusudur.
// "Ne arıyorsun?" (seeking) sorusu ayrı bir ilk adımdır (bkz. SEEKING_QUESTION) — cevabına
// göre BASE_QUESTIONS'a PARTNER_QUESTIONS eklenip eklenmeyeceği belirlenir.

export const SEEKING_QUESTION = {
    id: 'seeking', type: 'choice',
    question: 'What are you looking for?',
    tr: 'Ne arıyorsun?',
    options: [
        { value: 'FRIENDS', text: 'New friends', tr: 'Yeni arkadaşlar' },
        { value: 'PARTNER', text: 'A romantic partner', tr: 'Bir sevgili' },
        { value: 'BOTH', text: 'Open to both', tr: 'İkisine de açığım' },
    ],
};

const BASE_QUESTIONS = [
    {
        id: 'social_style', type: 'choice',
        question: 'In a new social setting, you are usually...',
        tr: 'Yeni bir sosyal ortamda genelde...',
        options: [
            { value: 'outgoing', text: 'The one starting conversations', tr: 'Sohbeti başlatan kişi olurum' },
            { value: 'selective', text: 'Comfortable once I know a few people', tr: 'Birkaç kişiyi tanıyınca rahatlarım' },
            { value: 'reserved', text: 'Quiet at first, opening up slowly', tr: 'Önce sessizim, yavaş yavaş açılırım' },
        ],
    },
    {
        id: 'free_time', type: 'choice',
        question: 'How do you prefer to spend a free weekend?',
        tr: 'Boş bir hafta sonunu nasıl geçirmeyi tercih edersin?',
        options: [
            { value: 'outdoors', text: 'Outdoors — nature, sports, walking', tr: 'Dışarıda — doğa, spor, yürüyüş' },
            { value: 'nightlife', text: 'Going out — bars, events, nightlife', tr: 'Dışarı çıkmak — bar, etkinlik, gece hayatı' },
            { value: 'home', text: 'At home — movies, games, reading', tr: 'Evde — film, oyun, kitap' },
            { value: 'social_gathering', text: 'Small gatherings with close people', tr: 'Yakın çevreyle küçük buluşmalar' },
        ],
    },
    {
        id: 'conversation_pref', type: 'choice',
        question: 'What kind of conversations do you enjoy most?',
        tr: 'En çok hangi tür sohbetlerden keyif alırsın?',
        options: [
            { value: 'deep_conversation', text: 'Deep, meaningful topics', tr: 'Derin, anlamlı konular' },
            { value: 'humor', text: 'Light-hearted humor and banter', tr: 'Şakacı, eğlenceli muhabbet' },
            { value: 'practical', text: 'Practical, everyday topics', tr: 'Pratik, gündelik konular' },
        ],
    },
    {
        id: 'communication_style', type: 'choice',
        question: 'How would you describe your communication style?',
        tr: 'İletişim tarzını nasıl tanımlarsın?',
        options: [
            { value: 'direct', text: 'Direct and straightforward', tr: 'Doğrudan ve net' },
            { value: 'expressive', text: 'Expressive and emotional', tr: 'Duygusunu açıkça ifade eden' },
            { value: 'reserved', text: 'Reserved, thinks before speaking', tr: 'Ölçülü, konuşmadan önce düşünen' },
            { value: 'balanced', text: 'A balance of all of these', tr: 'Hepsinin dengeli bir karışımı' },
        ],
    },
    {
        id: 'interests', type: 'multiselect',
        question: 'Which of these describe your interests? (select all that apply)',
        tr: 'Bunlardan hangileri seni tanımlıyor? (birden fazla seçebilirsin)',
        options: [
            { value: 'outdoors', text: 'Outdoors & nature', tr: 'Doğa & outdoor' },
            { value: 'sports', text: 'Sports & fitness', tr: 'Spor & fitness' },
            { value: 'arts_culture', text: 'Arts & culture', tr: 'Sanat & kültür' },
            { value: 'gaming', text: 'Gaming', tr: 'Oyun' },
            { value: 'travel', text: 'Travel', tr: 'Seyahat' },
            { value: 'deep_conversation', text: 'Deep conversation', tr: 'Derin sohbet' },
            { value: 'nightlife', text: 'Nightlife & going out', tr: 'Gece hayatı' },
            { value: 'foodie', text: 'Food & cooking', tr: 'Yemek & mutfak' },
            { value: 'music', text: 'Music', tr: 'Müzik' },
            { value: 'quiet_nights', text: 'Quiet nights in', tr: 'Sakin evde vakit' },
        ],
    },
    {
        id: 'about_you', type: 'text',
        question: 'Tell us a bit about yourself and what you value in a friendship.',
        tr: 'Kendinden ve arkadaşlıkta önem verdiğin şeylerden kısaca bahset.',
    },
];

const PARTNER_QUESTIONS = [
    {
        id: 'relationship_goal', type: 'choice',
        question: 'What kind of relationship are you looking for?',
        tr: 'Nasıl bir ilişki arıyorsun?',
        options: [
            { value: 'long_term', text: 'Long-term, serious relationship', tr: 'Uzun soluklu, ciddi bir ilişki' },
            { value: 'casual', text: 'Casual, no pressure', tr: 'Rahat, baskısız' },
            { value: 'marriage_minded', text: 'Marriage-minded', tr: 'Evlilik düşünerek' },
            { value: 'not_sure', text: 'Not sure yet', tr: 'Henüz emin değilim' },
        ],
    },
    {
        id: 'love_language', type: 'choice',
        question: 'What makes you feel most valued in a relationship?',
        tr: 'Bir ilişkide seni en çok ne değerli hissettirir?',
        options: [
            { value: 'quality_time', text: 'Spending quality time together', tr: 'Birlikte kaliteli zaman geçirmek' },
            { value: 'words', text: 'Words of affirmation', tr: 'Sözlü onay ve takdir' },
            { value: 'acts_of_service', text: 'Acts of service', tr: 'Küçük jestler, yardımlar' },
            { value: 'physical_touch', text: 'Physical closeness', tr: 'Fiziksel yakınlık' },
        ],
    },
    {
        id: 'dealbreakers', type: 'multiselect',
        question: 'Any dealbreakers for you? (select all that apply)',
        tr: 'Senin için kesin geçilmezler var mı? (birden fazla seçebilirsin)',
        options: [
            { value: 'smoking', text: 'Smoking', tr: 'Sigara kullanımı' },
            { value: 'no_kids', text: "Doesn't want kids", tr: 'Çocuk istememesi' },
            { value: 'wants_kids', text: 'Wants kids urgently', tr: 'Acil çocuk istemesi' },
            { value: 'long_distance', text: 'Long distance', tr: 'Uzak mesafe' },
            { value: 'different_life_goals', text: 'Very different life goals', tr: 'Çok farklı hayat hedefleri' },
        ],
    },
    {
        id: 'about_partner', type: 'text',
        question: 'What are you hoping to find in a partner?',
        tr: 'Bir partnerde neyi bulmayı umuyorsun?',
    },
];

function translateQuestion(q, lang) {
    if (lang === 'en') return q;
    return {
        ...q,
        question: q.tr || q.question,
        options: q.options ? q.options.map(o => ({ ...o, text: o.tr || o.text })) : undefined,
    };
}

export function getSeekingQuestion(lang = 'en') {
    return translateQuestion(SEEKING_QUESTION, lang);
}

export function getFriendFindingQuestions(seeking = 'FRIENDS', lang = 'en') {
    const raw = seeking === 'FRIENDS' ? BASE_QUESTIONS : [...BASE_QUESTIONS, ...PARTNER_QUESTIONS];
    return raw.map(q => translateQuestion(q, lang));
}
