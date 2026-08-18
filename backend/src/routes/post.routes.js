import { Router } from 'express';
import {
    createPost, getPosts, getUserPosts,
    analyzeContent, suggestMusicForImage, toggleLike, addComment,
    getComments, getPostLikes, editPost, toggleVisibility, deletePost,
    recordView, getStoryViews,
    getPendingMatchMedia, approveMatchMedia, rejectMatchMedia,
} from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',                  authenticate, getPosts);
router.post('/',                 authenticate, createPost);
router.post('/analyze',          authenticate, analyzeContent);
router.post('/suggest-music',    authenticate, suggestMusicForImage);
router.get('/user/:userId',      authenticate, getUserPosts);
router.post('/:id/like',         authenticate, toggleLike);
router.post('/:id/comment',      authenticate, addComment);
router.get('/:id/comments',      authenticate, getComments);
router.get('/:id/likes',         authenticate, getPostLikes);
router.patch('/:id',             authenticate, editPost);
router.patch('/:id/visibility',  authenticate, toggleVisibility);
router.delete('/:id',            authenticate, deletePost);
router.post('/:id/view',         authenticate, recordView);
router.get('/:id/views',         authenticate, getStoryViews);
router.get('/pending/:rivalId',    authenticate, getPendingMatchMedia);
router.patch('/:id/approve-media', authenticate, approveMatchMedia);
router.patch('/:id/reject-media',  authenticate, rejectMatchMedia);

export default router;
