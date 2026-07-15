import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    createTournament,
    getTournaments,
    getTournamentById,
    voteTournamentType,
    joinTournament,
    setTournamentPartner,
    cancelJoin,
    requestCancellation,
    getJoinRequests,
    getParticipants,
    updateJoinRequest,
    updateTournament,
    deleteTournament,
    completeTournament,
    getArchivedTournaments,
    startTournament,
    getTournamentMatches,
    enterTournamentMatchScore,
    confirmTournamentMatchScore,
    approveCancelRequest,
    removeParticipant,
    addManualParticipant,
    removeManualParticipant,
    rematchTournament,
    requestTournamentPermission,
    getTournamentPermissionStatus,
    useJoker,
    regenCurrentGroupRound,
    fixGroupDeadlines,
    getTournamentChat,
    sendTournamentChatMessage,
    getChatNotifyPref,
    setChatNotifyPref,
    getTournamentCourts,
    addTournamentCourt,
    removeTournamentCourt,
    assignCourtToMatch,
} from '../controllers/tournament.controller.js';

const router = Router();
router.use(authenticate);

router.get('/permission-status',             getTournamentPermissionStatus);
router.post('/permission-request',           requestTournamentPermission);
router.get('/',                              getTournaments);
router.get('/archived',                      getArchivedTournaments);
router.get('/:id',                           getTournamentById);
router.post('/',                             createTournament);
router.post('/:id/vote-type',                voteTournamentType);
router.post('/:id/join',                     joinTournament);
router.patch('/:id/partner',                 setTournamentPartner);
router.delete('/:id/join',                   cancelJoin);
router.post('/:id/cancel-request',           requestCancellation);
router.post('/:id/complete',                 completeTournament);
router.get('/:id/participants',               getParticipants);
router.get('/:id/requests',                  getJoinRequests);
router.patch('/:id/requests/:userId',                    updateJoinRequest);
router.post('/:id/participants/manual',                  addManualParticipant);
router.delete('/:id/participants/manual/:participantId', removeManualParticipant);
router.post('/:id/participants/:userId/cancel-approve',  approveCancelRequest);
router.delete('/:id/participants/:userId',               removeParticipant);
router.post('/:id/start',                               startTournament);
router.post('/:id/rematch',                             rematchTournament);
router.get('/:id/matches',                   getTournamentMatches);
router.patch('/:id/matches/:matchId/score',  enterTournamentMatchScore);
router.post('/:id/matches/:matchId/confirm', confirmTournamentMatchScore);
router.post('/:id/matches/:matchId/joker',   useJoker);
router.post('/:id/regen-round',              regenCurrentGroupRound);
router.post('/:id/fix-deadlines',            fixGroupDeadlines);
router.get('/:id/chat',                      getTournamentChat);
router.post('/:id/chat',                     sendTournamentChatMessage);
router.get('/:id/chat/notify',                getChatNotifyPref);
router.patch('/:id/chat/notify',              setChatNotifyPref);
router.get('/:id/courts',                    getTournamentCourts);
router.post('/:id/courts',                   addTournamentCourt);
router.delete('/:id/courts/:courtId',        removeTournamentCourt);
router.patch('/:id/matches/:matchId/court',  assignCourtToMatch);
router.patch('/:id',                         updateTournament);
router.delete('/:id',                        deleteTournament);

export default router;
