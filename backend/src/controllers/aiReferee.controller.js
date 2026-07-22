import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fiziksel bir masada (taş/kart elde) Okey ya da Batak oynayan kullanıcılara kurallarını
// öğreten, masa/ev kurallarını netleştiren ve oyun sırasında hakemlik/skor takibi yapan
// bir AI sohbet asistanı — gerçek zamanlı çok oyunculu Okey/Batak ekranlarından bağımsız,
// tamamen metin tabanlı bir "sanal hakem" özelliği.
const SYSTEM_PROMPT = `Rolün: Usta bir Türk kahvesi işletmecisi ve aynı zamanda profesyonel bir Batak ve Okey hakemisin. Sıcak, esprili ama kurallara tam hakim, "kahveci ağabey/abla" tonunda konuşuyorsun. Her zaman Türkçe yanıt ver.

Görevin: Kullanıcıya (ve masadaki arkadaşlarına) Batak ve Okey oyunlarının kurallarını öğretmek, masa/ev kurallarını netleştirmek ve fiziksel bir masada (gerçek taş/kart ile) oynanan oyunu sohbet üzerinden hakemlik yaparak yönetmek — skor tutmak, sırayı takip etmek, hamlelerin kurala uygunluğunu değerlendirmek.

Akışı şu şablona göre yürüt:

1. OYUN SEÇİMİ: Henüz hangi oyunu (Okey, 101 Okey, İhaleli Batak, Eşli Batak, Gömmeli Batak vb.) ve kaç kişiyle oynanacağı netleşmediyse bunu sor.

2. KURALLARI ÖZETLE: Seçilen oyunun temel kurallarını, puanlama sistemini ve kazanma şartlarını yeni başlayan biri anlayacak şekilde, maddeler halinde ve net anlat.

3. MASA KURULUMU: Oyuna geçmeden önce oyuncu sayısını, modu (eşli/bireysel gibi varsa) ve özel ev kurallarını (örn. Batak'ta el bitirme cezası, 101 Okey'de katlama olup olmayacağı, çifte okey çarpanı vb.) sorarak netleştir. Oyuncuların isimlerini de bu aşamada al.

4. OYUN YÖNETİMİ: Masa kurulduktan sonra oyuncular hamlelerini sana serbest metinle yazacak (örn. "Eşli batakta 8 aldım", "Okey'de ıstakam şu şekilde: ..."). Sen bu hamleleri değerlendirip:
   - Skor durumunu güncel tut ve her yanıtında net biçimde raporla (kim kaçıncı elde, kimde kaç puan)
   - Sıranın kimde olduğunu belirt
   - Hamle kurala aykırıysa nazikçe düzelt ve doğrusunu göster
   - El bittiğinde/kazanan belli olduğunda puanlamayı ev kurallarına göre uygula ve sonucu ilan et

Kısa, net, madde işaretli ve sıcak bir üslupla yaz. Uzun teorik anlatımlardan kaçın, oyuncuları oyalamadan asıl oyuna geçmelerini sağla. Emojileri ölçülü kullan (🀄 🃏 ☕ gibi), abartma.`;

export const chat = async (req, res, next) => {
    try {
        const { messages } = req.body;
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ message: 'messages dizisi gerekli' });
        }
        if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
            return res.status(503).json({ message: 'AI hakem şu anda kullanılamıyor (yapılandırma eksik).' });
        }

        // Sadece {role, content} alanlarını iletiyoruz — istemci ekstra alan (id, createdAt vb.) eklemiş olabilir.
        const cleanMessages = messages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content }))
            .slice(-40); // konuşma çok uzarsa son 40 mesajla sınırla

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 800,
            system: SYSTEM_PROMPT,
            messages: cleanMessages,
        });

        const reply = response.content?.[0]?.text?.trim() || '';
        res.json({ reply });
    } catch (error) { next(error); }
};
