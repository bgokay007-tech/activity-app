import { Router } from 'express';
import {
    createRivalRequest, getRivalRequests,
    sendJoinRequest, respondToJoin,
    getUpcomingMatches, getMyRequests,
    cancelRequest, enterScore, confirmScore, disputeScore, reportDispute,
    archiveMatch, getCompletedMatches, getArchivedMatchesBySport,
    extendScoreDeadline, getCountsBySubCategory, abandonMatch, cancelMatch,
    getMatchComments, addMatchComment, deleteMatchComment,
    getMyUpcomingMatches, getMyMatchHistory,
    proposeSchedule, acceptSchedule, updateRivalRequest,
} from '../controllers/rival.controller.js';
import { reportNoShow } from '../controllers/noshow.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',                      authenticate, getRivalRequests);
router.get('/counts',                authenticate, getCountsBySubCategory);
router.post('/',                     authenticate, createRivalRequest);
router.patch('/:id',                 authenticate, updateRivalRequest);
router.get('/upcoming',              authenticate, getUpcomingMatches);
router.get('/my-upcoming',           authenticate, getMyUpcomingMatches);
router.get('/my-history',            authenticate, getMyMatchHistory);
router.get('/completed',             authenticate, getCompletedMatches);
router.get('/archived',              authenticate, getArchivedMatchesBySport);
router.get('/my',                    authenticate, getMyRequests);
router.post('/:id/respond',          authenticate, sendJoinRequest);
router.patch('/join/:requestId',     authenticate, respondToJoin);
router.patch('/:id/cancel',          authenticate, cancelRequest);
router.patch('/:id/score',           authenticate, enterScore);
router.patch('/:id/confirm-score',   authenticate, confirmScore);
router.patch('/:id/dispute-score',   authenticate, disputeScore);
router.post('/:id/report-dispute',   authenticate, reportDispute);
router.patch('/:id/archive',         authenticate, archiveMatch);
router.patch('/:id/extend-score',    authenticate, extendScoreDeadline);
router.patch('/:id/abandon',         authenticate, abandonMatch);
router.patch('/:id/cancel-match',    authenticate, cancelMatch);
router.get('/:id/comments',          authenticate, getMatchComments);
router.post('/:id/comments',         authenticate, addMatchComment);
router.delete('/comments/:commentId', authenticate, deleteMatchComment);
router.post('/:id/no-show',          authenticate, reportNoShow);
router.post('/:id/propose-schedule', authenticate, proposeSchedule);
router.post('/:id/accept-schedule',  authenticate, acceptSchedule);

export default router;
