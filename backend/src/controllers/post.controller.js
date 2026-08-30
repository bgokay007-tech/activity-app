import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { getRelation, canAccess } from '../utils/privacy.js';
import { createNotification } from './notification.controller.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const POST_INCLUDE = (userId) => ({
    user: { select: { id: true, username: true, fullName: true, avatar: true, city: true } },
    likes: { where: { userId }, select: { id: true } },
    _count: { select: { likes: true, comments: true } },
});

export const createPost = async (req, res, next) => {
    try {
        const { category, subCategory, content, imageUrl, videoUrl, type = 'POST', targets, location, musicStartTime, musicEndTime, rivalId } = req.body;

        // targets: [{category, subCategory}, ...] — multi-branch support
        // primary category/subCategory comes from the first target if not provided
        const primaryCategory = category || targets?.[0]?.category;
        const primarySubCategory = subCategory || targets?.[0]?.subCategory;

        const { muteVideo = false, musicUrl, musicName, musicArtist, musicCoverUrl } = req.body;

        // Maç skor girişinden "Medya Paylaş" ile bağlanan medya — sadece maça gerçekten
        // dahil olan biri (kurucu/takım arkadaşı/rakip) kendi maçını etiketleyebilir,
        // rastgele bir rivalId'yi paylaşımına iliştiremez.
        let verifiedRivalId = null;
        // Kullanıcı isteği: skor henüz karşı tarafça onaylanmamışken (scoreStatus PENDING)
        // paylaşılan medya, skorla aynı şekilde karşı tarafın onayını bekler — onaylanana
        // kadar Medya sekmesinde kimseye görünmez (bkz. getPosts'taki mediaApprovalStatus
        // filtresi ve rival.controller.js'teki approveMatchMedia/rejectMatchMedia).
        let mediaApprovalStatus = null;
        if (rivalId) {
            const rival = await prisma.activityRequest.findUnique({
                where: { id: rivalId },
                select: { senderId: true, participants: true, senderTeam: true, scoreStatus: true, scoreEnteredBy: true },
            });
            const participants = Array.isArray(rival?.participants) ? rival.participants : [];
            const senderTeamArr = Array.isArray(rival?.senderTeam) ? rival.senderTeam : [];
            const isInvolved = rival && (
                rival.senderId === req.userId
                || participants.some(p => p?.id === req.userId)
                || senderTeamArr.some(p => p?.id === req.userId)
            );
            if (isInvolved) {
                verifiedRivalId = rivalId;
                // Sadece skoru GİREN tarafın (scoreEnteredBy) paylaştığı medya onay bekler —
                // karşı taraf zaten skoru onaylarken kendi medyasını da ekleyip aynı anda
                // yayınlayabilir (bkz. approveMatchMedia yanındaki mobil "Kendi Medyanı Ekle").
                if (rival.scoreStatus === 'PENDING' && rival.scoreEnteredBy && (imageUrl || videoUrl)) {
                    const teamA = new Set([rival.senderId, ...senderTeamArr.filter(m => m?.id).map(m => m.id)]);
                    const scorerInA = teamA.has(rival.scoreEnteredBy);
                    const posterInA = teamA.has(req.userId);
                    if (scorerInA === posterInA) mediaApprovalStatus = 'PENDING';
                }
            }
        }

        const post = await prisma.post.create({
            data: {
                userId: req.userId,
                category: primaryCategory,
                subCategory: primarySubCategory,
                content,
                imageUrl,
                videoUrl,
                type,
                targets: targets ?? null,
                muteVideo: Boolean(muteVideo),
                ...(musicUrl && { musicUrl }),
                ...(musicName && { musicName }),
                ...(musicArtist && { musicArtist }),
                ...(musicCoverUrl && { musicCoverUrl }),
                ...(location && { location }),
                ...(musicStartTime != null && { musicStartTime: Number(musicStartTime) }),
                ...(musicEndTime   != null && { musicEndTime:   Number(musicEndTime) }),
                ...(type === 'STORY' && { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
                ...(verifiedRivalId && { rivalId: verifiedRivalId }),
                ...(mediaApprovalStatus && { mediaApprovalStatus }),
            },
            include: {
                user: { select: { id: true, username: true, fullName: true, avatar: true } },
                _count: { select: { likes: true, comments: true } },
            },
        });

        res.status(201).json(post);

        if (mediaApprovalStatus === 'PENDING') {
            notifyMediaApprovers(post).catch(() => {});
        }
    } catch (error) {
        next(error);
    }
};

// Skor bekleyen (PENDING) bir maçta paylaşılan medyanın onayını, skoru onaylayacak KARŞI
// TARAFA (skoru girenin kendi takımı hariç, confirmScore'daki teamA/teamB ayrımıyla aynı
// mantık) bildirir — approve/rejectMatchMedia da aynı ayrımla yetkilendirme yapıyor.
async function notifyMediaApprovers(post) {
    const rival = await prisma.activityRequest.findUnique({ where: { id: post.rivalId } });
    if (!rival) return;
    const participants = Array.isArray(rival.participants) ? rival.participants : [];
    const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
    const teamA = new Set([rival.senderId, ...senderTeamArr.filter(m => m?.id).map(m => m.id)]);
    const teamB = new Set(participants.filter(p => p?.id).map(p => p.id));
    const uploaderInA = teamA.has(post.userId);
    const approverIds = [...(uploaderInA ? teamB : teamA)].filter(id => id !== post.userId);

    const uploader = await prisma.user.findUnique({ where: { id: post.userId }, select: { username: true, fullName: true } });
    for (const uid of approverIds) {
        createNotification(
            uid, 'MATCH_MEDIA_PENDING',
            '📸 Onay Bekleyen Medya',
            `${uploader?.fullName || uploader?.username || 'Rakibin'}, maçtan bir foto/video paylaştı — skorla birlikte senin onayını bekliyor.`,
            { rivalId: post.rivalId, postId: post.id, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});
    }
}

// Skoru onaylayacak taraf (confirmScore'daki teamA/teamB ile birebir aynı ayrım), sadece
// karşı taraftan biri mi diye kontrol eder — approve/reject uçları bunu paylaşıyor.
async function assertCanReviewMedia(post, userId) {
    if (!post.rivalId) return null;
    const rival = await prisma.activityRequest.findUnique({ where: { id: post.rivalId } });
    if (!rival) return null;
    const participants = Array.isArray(rival.participants) ? rival.participants : [];
    const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
    const teamA = new Set([rival.senderId, ...senderTeamArr.filter(m => m?.id).map(m => m.id)]);
    const teamB = new Set(participants.filter(p => p?.id).map(p => p.id));
    const uploaderInA = teamA.has(post.userId);
    const reviewerSet = uploaderInA ? teamB : teamA;
    if (!reviewerSet.has(userId)) return null;
    return rival;
}

// Skor bekleyen maçta, benim onayımı bekleyen (karşı tarafın paylaştığı) medya var mı —
// UpcomingCard'da "Skor Bekleyen Maçlar" kartı bunu açılışta çekip Onayla/Reddet gösterir.
export const getPendingMatchMedia = async (req, res, next) => {
    try {
        const { rivalId } = req.params;
        const rival = await prisma.activityRequest.findUnique({ where: { id: rivalId } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const isInvolved = rival.senderId === req.userId
            || participants.some(p => p?.id === req.userId)
            || senderTeamArr.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const posts = await prisma.post.findMany({
            where: { rivalId, mediaApprovalStatus: 'PENDING' },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(posts);
    } catch (error) { next(error); }
};

export const approveMatchMedia = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id } });
        if (!post) return res.status(404).json({ message: 'Bulunamadı' });
        if (post.mediaApprovalStatus !== 'PENDING') return res.status(400).json({ message: 'Onay bekleyen bir medya değil' });
        const rival = await assertCanReviewMedia(post, req.userId);
        if (!rival) return res.status(403).json({ message: 'Bu medyayı onaylama yetkiniz yok' });

        const updated = await prisma.post.update({ where: { id }, data: { mediaApprovalStatus: 'APPROVED' } });
        res.json(updated);

        createNotification(
            post.userId, 'MATCH_MEDIA_APPROVED',
            '✅ Medyanız Onaylandı',
            'Maçtan paylaştığınız foto/video karşı tarafça onaylandı, artık Medya sekmesinde görünüyor.',
            { rivalId: post.rivalId, postId: post.id, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});
    } catch (error) { next(error); }
};

export const rejectMatchMedia = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id } });
        if (!post) return res.status(404).json({ message: 'Bulunamadı' });
        if (post.mediaApprovalStatus !== 'PENDING') return res.status(400).json({ message: 'Onay bekleyen bir medya değil' });
        const rival = await assertCanReviewMedia(post, req.userId);
        if (!rival) return res.status(403).json({ message: 'Bu medyayı reddetme yetkiniz yok' });

        const updated = await prisma.post.update({ where: { id }, data: { mediaApprovalStatus: 'REJECTED' } });
        res.json(updated);

        createNotification(
            post.userId, 'MATCH_MEDIA_REJECTED',
            '😕 Medyanız Reddedildi',
            'Maçtan paylaştığınız foto/video karşı tarafça reddedildi, paylaşılmadı.',
            { rivalId: post.rivalId, postId: post.id, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});
    } catch (error) { next(error); }
};

export const getPosts = async (req, res, next) => {
    try {
        const { category: categoryRaw, subCategory, page = 1, limit = 10, type, communityOnly, mediaOnly, rivalId } = req.query;
        const category = categoryRaw ? categoryRaw.toUpperCase() : categoryRaw;
        const skip = (page - 1) * limit;

        // Build branch filter
        const where = {};
        if (communityOnly === 'true') {
            where.category = category;
            where.subCategory = subCategory;
            where.type = 'POST';
            where.imageUrl = null;
            where.videoUrl = null;
        } else if (category && subCategory) {
            // Branch media/stories: match primary fields OR targets array
            // Community posts naturally excluded because media tab filters by imageUrl
            // and STORY type has no community equivalent
            where.OR = [
                { category, subCategory },
                { targets: { array_contains: [{ category, subCategory }] } },
            ];
        } else if (category) {
            where.category = category;
        }
        // Kullanıcı isteği: bir maç/ilan detayında o maça özel paylaşılan medyaların listesi —
        // rivalId ile bağlı Post'lar (bkz. createPost'taki verifiedRivalId), diğer filtrelerden
        // bağımsız kullanılabilir.
        if (rivalId) where.rivalId = rivalId;
        if (type) where.type = type;
        if (mediaOnly === 'true') {
            where.AND = [
                ...(where.AND || []),
                { OR: [{ imageUrl: { not: null } }, { videoUrl: { not: null } }] },
            ];
        }
        // Active stories only in branch feeds (not expired)
        if (type === 'STORY') {
            where.AND = [
                ...(where.AND || []),
                { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ];
        }

        // Privacy: only show posts from public accounts or friends
        const [friendships, blocks] = await Promise.all([
            prisma.friendship.findMany({
                where: { status: 'ACCEPTED', OR: [{ senderId: req.userId }, { receiverId: req.userId }] },
                select: { senderId: true, receiverId: true },
            }),
            prisma.block.findMany({
                where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] },
                select: { blockerId: true, blockedId: true },
            }),
        ]);
        const friendIds = friendships.map(f => f.senderId === req.userId ? f.receiverId : f.senderId);
        const blockedIds = blocks.map(b => b.blockerId === req.userId ? b.blockedId : b.blockerId);

        // Community board = public branch feed, only block-filter applies
        // Normal feed = public or friends only
        where.user = communityOnly === 'true'
            ? { id: { notIn: blockedIds } }
            : { id: { notIn: blockedIds }, OR: [{ isPublic: true }, { id: req.userId }, { id: { in: friendIds } }] };
        // Hide hidden posts from everyone except the owner
        where.AND = [
            ...(where.AND || []),
            { OR: [{ hidden: false }, { userId: req.userId }] },
        ];
        // Skor bekleyen maçta paylaşılan medya (mediaApprovalStatus PENDING) karşı taraf
        // onaylayana kadar hiç kimseye (sahibi dahil) genel feed'de görünmez — onay durumu
        // sadece kartın kendisinde (bkz. getPendingMatchMedia) gösteriliyor. Reddedilen
        // (REJECTED) medya asla yayınlanmaz. DİKKAT: mediaApprovalStatus çoğu post için null
        // (gate yok) — Prisma'nın notIn'i SQL'de "NOT IN" olduğu için null satırları da
        // (yanlışlıkla) elerdi, bu yüzden null'u ayrıca OR ile eklemek şart.
        where.AND.push({ OR: [{ mediaApprovalStatus: null }, { mediaApprovalStatus: 'APPROVED' }] });

        const posts = await prisma.post.findMany({
            where,
            include: {
                ...POST_INCLUDE(req.userId),
                comments: {
                    take: 2,
                    orderBy: { createdAt: 'desc' },
                    include: { user: { select: { id: true, username: true, avatar: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: Number(skip),
            take: Number(limit),
        });

        res.json(posts.map(p => ({ ...p, isLiked: p.likes.length > 0, likes: undefined })));
    } catch (error) {
        next(error);
    }
};

export const getUserPosts = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { type } = req.query;

        const isOwner = userId === req.userId;
        const { archive } = req.query;
        const now = new Date();

        // POST/REEL gorunurlugu sahibinin gizlilik ayarina tabi (STORY vb. etkilenmez)
        if (!isOwner && (type === 'POST' || type === 'REEL')) {
            const owner = await prisma.user.findUnique({
                where: { id: userId },
                select: { postsPrivacy: true, postsExclude: true, reelsPrivacy: true, reelsExclude: true },
            });
            if (!owner) return res.status(404).json({ message: 'User not found' });
            const { isFriend, isFollower } = await getRelation(userId, req.userId);
            const mode = type === 'POST' ? owner.postsPrivacy : owner.reelsPrivacy;
            const list = type === 'POST' ? owner.postsExclude : owner.reelsExclude;
            if (!canAccess({ ownerId: userId, viewerId: req.userId, mode, list, isFriend, isFollower })) {
                return res.json([]);
            }
        }

        const storyFilter = type === 'STORY'
            ? archive === 'true'
                // Archive: expired stories — owner only
                ? isOwner ? { expiresAt: { lt: now } } : { id: 'none' }
                // Active stories: not expired
                : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
            : {};

        const posts = await prisma.post.findMany({
            where: {
                userId,
                ...(type ? { type } : {}),
                ...storyFilter,
                // Non-owners cannot see hidden posts
                ...(!isOwner ? { hidden: false } : {}),
                // Non-owners cannot see medya onayı bekleyen/reddedilen paylaşımları — sahibi
                // kendi profilinde görebilir (bkz. mediaApprovalStatus, getPosts'taki aynı kural).
                ...(!isOwner ? { OR: [{ mediaApprovalStatus: null }, { mediaApprovalStatus: 'APPROVED' }] } : {}),
            },
            include: {
                ...POST_INCLUDE(req.userId),
                ...(type === 'STORY' && {
                    storyViews: {
                        where: { userId: req.userId },
                        select: { id: true },
                    },
                }),
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(posts.map(p => ({
            ...p,
            isLiked: p.likes.length > 0,
            likes: undefined,
            ...(type === 'STORY' && { viewedByMe: (p.storyViews?.length ?? 0) > 0, storyViews: undefined }),
        })));
    } catch (error) {
        next(error);
    }
};

export const analyzeContent = async (req, res, next) => {
    try {
        const { content, imageUrl, videoUrl, userInterests } = req.body;

        if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
            return res.status(503).json({ message: 'AI analysis not configured' });
        }

        // Build message content
        const messageContent = [];

        if (imageUrl) {
            // Try to include image for vision analysis
            try {
                const imgResp = await fetch(imageUrl);
                if (imgResp.ok) {
                    const buffer = await imgResp.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const mime = imgResp.headers.get('content-type') || 'image/jpeg';
                    messageContent.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
                }
            } catch { /* skip image if can't fetch */ }
        }

        const interestsList = userInterests.map(i => `${i.category}/${i.subCategory}`).join(', ');

        messageContent.push({
            type: 'text',
            text: `You are analyzing a social media post for an activity-based platform.

User's joined branches: ${interestsList || 'none'}

Post content: "${content || '(no text)'}"
${imageUrl ? `Image URL: ${imageUrl}` : ''}
${videoUrl ? `Video URL: ${videoUrl}` : ''}

Based on the content${imageUrl ? ' and image' : ''}, determine:
1. Which of the user's branches this content is relevant to (can be multiple)
2. Whether it's relevant at all to any branch

Respond ONLY with valid JSON in this exact format:
{
  "suggestedBranches": [{"category": "SPORTS", "subCategory": "tennis"}],
  "warning": null,
  "relevanceNote": "Brief explanation of why these branches were suggested"
}

Rules:
- suggestedBranches: array of {category, subCategory} objects from the user's joined branches only
- warning: null if content is relevant, or a short warning string if content seems unrelated (e.g. "This content doesn't seem related to your activities. Are you sure you want to post it?")
- If content is clearly relevant to branches the user hasn't joined, add a note in warning suggesting they add those branches first
- Keep relevanceNote under 20 words`,
        });

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: messageContent }],
        });

        const raw = response.content[0].text.trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestedBranches: [], warning: 'Could not analyze content.', relevanceNote: '' };

        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const suggestMusicForImage = async (req, res, next) => {
    try {
        const { imageBase64, mimeType, subCategory } = req.body;

        const fallback = [
            `${subCategory} sports motivation`,
            'energetic workout',
            'champion mindset',
            'summer sports vibes',
        ];

        if (!imageBase64 || !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
            return res.json({ keywords: fallback });
        }

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 },
                    },
                    {
                        type: 'text',
                        text: `This is a sports/activity photo (${subCategory || 'sports'}). Suggest 4 short Deezer music search keywords that match the mood, energy level, setting and emotions in this image. Consider: intensity (calm/intense), setting (outdoor/indoor/court), emotion (triumph/focus/fun), time of day. Return ONLY a JSON array of strings like ["energetic workout", "summer vibes", "champions motivation", "rock sports"]. No explanation.`,
                    },
                ],
            }],
        });

        const raw = response.content[0].text.trim();
        const match = raw.match(/\[[\s\S]*?\]/);
        const keywords = match ? JSON.parse(match[0]) : fallback;
        res.json({ keywords: keywords.slice(0, 5) });
    } catch (error) { next(error); }
};

export const toggleLike = async (req, res, next) => {
    try {
        const { id } = req.params;
        const existing = await prisma.like.findUnique({
            where: { userId_postId: { userId: req.userId, postId: id } },
        });
        if (existing) {
            await prisma.like.delete({ where: { id: existing.id } });
            return res.json({ isLiked: false });
        }
        await prisma.like.create({ data: { userId: req.userId, postId: id } });
        res.status(201).json({ isLiked: true });
    } catch (error) {
        next(error);
    }
};

export const addComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const comment = await prisma.comment.create({
            data: { userId: req.userId, postId: id, content },
            include: { user: { select: { id: true, username: true, avatar: true } } },
        });
        res.status(201).json(comment);
    } catch (error) {
        next(error);
    }
};

// Gonderi sahibinin likesCommentsPrivacy ayarina gore begenen/yorumlayan kimliklerini
// gorebilir mi kontrol eder. Begenme/yorum yapma eylemi bundan etkilenmez, sadece
// kim begendi/yorumladi listesinin gorunurlugu kisitlanir.
async function canSeeLikesComments(postOwnerId, viewerId) {
    if (postOwnerId === viewerId) return true;
    const owner = await prisma.user.findUnique({
        where: { id: postOwnerId },
        select: { likesCommentsPrivacy: true, likesCommentsExclude: true },
    });
    if (!owner) return false;
    const { isFriend, isFollower } = await getRelation(postOwnerId, viewerId);
    return canAccess({
        ownerId: postOwnerId, viewerId,
        mode: owner.likesCommentsPrivacy, list: owner.likesCommentsExclude,
        isFriend, isFollower,
    });
}

export const getComments = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
        if (!post) return res.status(404).json({ message: 'Not found' });
        if (!(await canSeeLikesComments(post.userId, req.userId))) {
            return res.status(403).json({ message: 'Bu gönderinin yorumları gizli' });
        }

        const comments = await prisma.comment.findMany({
            where: { postId: id },
            include: { user: { select: { id: true, username: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(comments);
    } catch (error) {
        next(error);
    }
};

export const getPostLikes = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
        if (!post) return res.status(404).json({ message: 'Not found' });
        if (!(await canSeeLikesComments(post.userId, req.userId))) {
            return res.status(403).json({ message: 'Bu gönderinin beğenenleri gizli' });
        }

        const likes = await prisma.like.findMany({
            where: { postId: id },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });
        res.json(likes);
    } catch (error) {
        next(error);
    }
};

export const editPost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content, targets, muteVideo, musicUrl, musicName, musicArtist, musicCoverUrl } = req.body;
        const post = await prisma.post.findUnique({ where: { id } });
        if (!post || post.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        const updated = await prisma.post.update({
            where: { id },
            data: {
                ...(content !== undefined && { content }),
                ...(targets !== undefined && {
                    targets,
                    category: targets[0]?.category || post.category,
                    subCategory: targets[0]?.subCategory || post.subCategory,
                }),
                ...(muteVideo !== undefined && { muteVideo: Boolean(muteVideo) }),
                ...(musicUrl !== undefined && { musicUrl: musicUrl || null }),
                ...(musicName !== undefined && { musicName: musicName || null }),
                ...(musicArtist !== undefined && { musicArtist: musicArtist || null }),
                ...(musicCoverUrl !== undefined && { musicCoverUrl: musicCoverUrl || null }),
            },
            include: {
                user: { select: { id: true, username: true, fullName: true, avatar: true } },
                _count: { select: { likes: true, comments: true } },
            },
        });
        res.json(updated);
    } catch (error) { next(error); }
};

export const toggleVisibility = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id } });
        if (!post || post.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        const updated = await prisma.post.update({
            where: { id },
            data: { hidden: !post.hidden },
        });
        res.json({ hidden: updated.hidden });
    } catch (error) { next(error); }
};

export const deletePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id } });
        if (!post || post.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        await prisma.post.delete({ where: { id } });
        res.json({ message: 'Post deleted' });
    } catch (error) {
        next(error);
    }
};

export const recordView = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Don't count the post owner viewing their own story
        const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
        if (!post) return res.status(404).json({ message: 'Not found' });
        if (post.userId === req.userId) return res.json({ recorded: false });

        await prisma.storyView.upsert({
            where: { postId_userId: { postId: id, userId: req.userId } },
            create: { postId: id, userId: req.userId },
            update: {},
        });
        res.json({ recorded: true });
    } catch (error) { next(error); }
};

export const getStoryViews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
        if (!post || post.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        const views = await prisma.storyView.findMany({
            where: { postId: id },
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });
        res.json(views);
    } catch (error) { next(error); }
};
