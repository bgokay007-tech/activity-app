import { Router } from 'express';
import {
    createRivalRequest, getRivalRequests, getRivalById, swapMatchPositions, setTeamName, assignPlayerToSide, swapTeamPlayers, assignDoubleSlot, addManualTeamPlayer,
    sendJoinRequest, respondToJoin, confirmLateJoin, withdrawJoinRequest, inviteToRival, setRivalJoinPartner,
    getUpcomingMatches, getMyRequests,
    cancelRequest, enterScore, confirmScore, disputeScore, reportDispute, appealScore,
    archiveMatch, getCompletedMatches, getArchivedMatchesBySport,
    extendScoreDeadline, getCountsBySubCategory, getActiveSubCategories, getLocationSuggestions,
    abandonMatch, cancelMatch, removeRivalParticipant,
    getMatchComments, addMatchComment, deleteMatchComment,
    getMyUpcomingMatches, getMyMatchHistory,
    proposeSchedule, acceptSchedule, updateRivalRequest,
    getForReservation, getRefereeApplications, submitRefereeReview, getRivalBill,
    requestBillPayment, reportBillUnpaid,
} from '../controllers/rival.controller.js';
import { reportNoShow } from '../controllers/noshow.controller.js';
import { getPeerReviewTargets, submitPeerReview } from '../controllers/peerReview.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/',                      authenticate, getRivalRequests);
router.get('/counts',                authenticate, getCountsBySubCategory);
router.get('/sub-categories',        authenticate, getActiveSubCategories);
router.get('/location-suggestions',  authenticate, getLocationSuggestions);
router.post('/',                     authenticate, createRivalRequest);
router.patch('/:id',                 authenticate, updateRivalRequest);
router.get('/upcoming',              authenticate, getUpcomingMatches);
router.get('/my-upcoming',           authenticate, getMyUpcomingMatches);
router.get('/my-history',            authenticate, getMyMatchHistory);
router.get('/completed',             authenticate, getCompletedMatches);
router.get('/archived',              authenticate, getArchivedMatchesBySport);
router.get('/my',                    authenticate, getMyRequests);
router.get('/for-reservation/:reservationId', authenticate, getForReservation);
router.post('/:id/respond',          authenticate, sendJoinRequest);
router.patch('/:id/join-partner',    authenticate, setRivalJoinPartner);
router.post('/:id/invite',           authenticate, inviteToRival);
router.patch('/join/:requestId',     authenticate, respondToJoin);
router.patch('/join/:requestId/confirm', authenticate, confirmLateJoin);
router.delete('/join/:requestId',    authenticate, withdrawJoinRequest);
router.patch('/:id/cancel',          authenticate, cancelRequest);
router.patch('/:id/score',           authenticate, enterScore);
router.get('/:id/bill',              authenticate, getRivalBill);
router.post('/:id/request-bill-payment', authenticate, requestBillPayment);
router.post('/:id/report-bill-unpaid',   authenticate, reportBillUnpaid);
router.patch('/:id/confirm-score',   authenticate, confirmScore);
router.patch('/:id/dispute-score',   authenticate, disputeScore);
router.post('/:id/report-dispute',   authenticate, reportDispute);
router.post('/:id/appeal-score',     authenticate, appealScore);
router.post('/:id/referee-review',   authenticate, submitRefereeReview);
router.patch('/:id/archive',         authenticate, archiveMatch);
router.patch('/:id/extend-score',    authenticate, extendScoreDeadline);
router.patch('/:id/abandon',         authenticate, abandonMatch);
router.patch('/:id/cancel-match',    authenticate, cancelMatch);
router.delete('/:id/participants/:userId', authenticate, removeRivalParticipant);
router.patch('/:id/swap-positions',  authenticate, swapMatchPositions);
router.patch('/:id/team-name',       authenticate, setTeamName);
router.patch('/:id/assign-player',   authenticate, assignPlayerToSide);
router.patch('/:id/swap-team-player', authenticate, swapTeamPlayers);
router.patch('/:id/add-manual-player', authenticate, addManualTeamPlayer);
router.patch('/:id/assign-double-slot', authenticate, assignDoubleSlot);
router.get('/:id',                   authenticate, getRivalById);
router.get('/:id/referee-applications', authenticate, getRefereeApplications);
router.get('/:id/comments',          authenticate, getMatchComments);
router.post('/:id/comments',         authenticate, addMatchComment);
router.delete('/comments/:commentId', authenticate, deleteMatchComment);
router.post('/:id/no-show',          authenticate, reportNoShow);
router.post('/:id/propose-schedule', authenticate, proposeSchedule);
router.post('/:id/accept-schedule',  authenticate, acceptSchedule);
router.get('/:id/peer-review-targets', authenticate, getPeerReviewTargets);
router.post('/:id/peer-review',      authenticate, submitPeerReview);

export default router;
