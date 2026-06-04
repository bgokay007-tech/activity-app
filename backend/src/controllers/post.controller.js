import prisma from '../config/prisma.js';

export const createPost = async (req, res, next) => {
    try {
        const { category, subCategory, content, imageUrl } = req.body;

        const post = await prisma.post.create({
            data: {
                userId: req.userId,
                category,
                subCategory,
                content,
                imageUrl,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatar: true,
                    },
                },
                _count: {
                    select: { likes: true, comments: true },
                },
            },
        });

        res.status(201).json(post);
    } catch (error) {
        next(error);
    }
};

export const getPosts = async (req, res, next) => {
    try {
        const { category, subCategory, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const posts = await prisma.post.findMany({
            where: {
                category: category || undefined,
                subCategory: subCategory || undefined,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatar: true,
                    },
                },
                likes: {
                    where: { userId: req.userId },
                    select: { id: true },
                },
                comments: {
                    take: 2,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatar: true,
                            },
                        },
                    },
                },
                _count: {
                    select: { likes: true, comments: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: Number(skip),
            take: Number(limit),
        });

        const formattedPosts = posts.map(post => ({
            ...post,
            isLiked: post.likes.length > 0,
            likes: undefined,
        }));

        res.json(formattedPosts);
    } catch (error) {
        next(error);
    }
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

        await prisma.like.create({
            data: { userId: req.userId, postId: id },
        });

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
            data: {
                userId: req.userId,
                postId: id,
                content,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatar: true,
                    },
                },
            },
        });

        res.status(201).json(comment);
    } catch (error) {
        next(error);
    }
};

export const getComments = async (req, res, next) => {
    try {
        const { id } = req.params;

        const comments = await prisma.comment.findMany({
            where: { postId: id },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatar: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        res.json(comments);
    } catch (error) {
        next(error);
    }
};

export const deletePost = async (req, res, next) => {
    try {
        const { id } = req.params;

        const post = await prisma.post.findUnique({ where: { id } });

        if (!post || post.userId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await prisma.post.delete({ where: { id } });
        res.json({ message: 'Post deleted' });
    } catch (error) {
        next(error);
    }
};