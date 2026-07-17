import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INTEREST_VOCAB = ['outdoors', 'sports', 'arts_culture', 'gaming', 'travel', 'deep_conversation', 'nightlife', 'foodie', 'music', 'quiet_nights'];
const GOAL_VOCAB = ['long_term', 'casual', 'marriage_minded', 'not_sure'];
const DEALBREAKER_VOCAB = ['smoking', 'no_kids', 'wants_kids', 'long_distance', 'different_life_goals'];
const STYLE_VOCAB = ['direct', 'reserved', 'expressive', 'balanced'];

function fallbackProfile(answers) {
    // ANTHROPIC_API_KEY yoksa ya da AI çağrısı başarısız olursa, cevaplardan
    // basit bir çıkarım yapılır — eşleştirme yine çalışsın diye AI'sız bir yedek.
    return {
        version: 1,
        traits: { extraversion: 50, openness: 50, conscientiousness: 50, agreeableness: 50, emotionalStability: 50 },
        interests: Array.isArray(answers.interests) ? answers.interests.filter(i => INTEREST_VOCAB.includes(i)) : [],
        communicationStyle: STYLE_VOCAB.includes(answers.communication_style) ? answers.communication_style : 'balanced',
        relationshipGoals: Array.isArray(answers.relationship_goal) ? answers.relationship_goal : (answers.relationship_goal ? [answers.relationship_goal] : []),
        dealbreakers: Array.isArray(answers.dealbreakers) ? answers.dealbreakers.filter(d => DEALBREAKER_VOCAB.includes(d)) : [],
        summary: '',
    };
}

// answers: anketten gelen ham cevaplar (backend/src/config/friendFindingQuestions.js soru id'lerine göre)
// seeking: 'FRIENDS' | 'PARTNER' | 'BOTH'
// Dönüş: FriendFindingProfile.aiProfile'a yazılacak yapılandırılmış JSON
export async function generateCompatibilityProfile(answers, seeking) {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
        return fallbackProfile(answers);
    }

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{
                role: 'user',
                content: `You are a psychological profiler for a friend/partner-matching app. Analyze this user's survey answers and produce a structured compatibility profile.

Seeking: ${seeking}
Survey answers (JSON): ${JSON.stringify(answers)}

Respond ONLY with valid JSON in this exact format (use ONLY the allowed values listed — do not invent new tags):
{
  "traits": { "extraversion": 0-100, "openness": 0-100, "conscientiousness": 0-100, "agreeableness": 0-100, "emotionalStability": 0-100 },
  "interests": [array of applicable values from: ${INTEREST_VOCAB.join(', ')}],
  "communicationStyle": one of [${STYLE_VOCAB.join(', ')}],
  "relationshipGoals": [array of applicable values from: ${GOAL_VOCAB.join(', ')}] (empty array if seeking is FRIENDS),
  "dealbreakers": [array of applicable values from: ${DEALBREAKER_VOCAB.join(', ')}] (empty array if not provided),
  "summary": "a private 1-2 sentence psychological note in Turkish, never shown to other users, only used internally"
}

Infer traits from the tone and content of free-text answers plus the choice answers. Be concise and only use the allowed vocabulary values.`,
            }],
        });

        const raw = response.content[0].text.trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return fallbackProfile(answers);

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            version: 1,
            traits: parsed.traits || fallbackProfile(answers).traits,
            interests: (parsed.interests || []).filter(i => INTEREST_VOCAB.includes(i)),
            communicationStyle: STYLE_VOCAB.includes(parsed.communicationStyle) ? parsed.communicationStyle : 'balanced',
            relationshipGoals: (parsed.relationshipGoals || []).filter(g => GOAL_VOCAB.includes(g)),
            dealbreakers: (parsed.dealbreakers || []).filter(d => DEALBREAKER_VOCAB.includes(d)),
            summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
        };
    } catch {
        return fallbackProfile(answers);
    }
}
