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
    respondThirdPlaceMatch,
    assignThirdPlaceMatchDate,
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
    assignPlayoffRoundDeadline,
    extendRoundDeadline,
    extendMatchDeadline,
    drawUnscoredMatches,
    setMatchAvailability,
    proposeMatchSchedule,
    agreeMatchSchedule,
    clearMatchScheduleAgreed,
    reserveMatchSchedule,
} from '../controllers/tournament.controller.js';
import {
    getTournamentRounds,
    updateTournamentRound,
    upsertRoundAvailability,
    getRoundAvailabilities,
    generateRoundMatching,
    setRoundProposedMatches,
    approveRoundMatching,
    adminUpdateMatchSchedule,
    getMatchMessages,
    sendMatchMessage,
    respondMatchRequest,
} from '../controllers/tournamentAvailability.controller.js';

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
router.patch('/:id/matches/:matchId/third-place-response', respondThirdPlaceMatch);
router.patch('/:id/matches/:matchId/third-place-date',     assignThirdPlaceMatchDate);
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
router.patch('/:id/matches/:matchId/availability', setMatchAvailability);
router.post('/:id/matches/:matchId/schedule-propose', proposeMatchSchedule);
router.post('/:id/matches/:matchId/schedule-agree', agreeMatchSchedule);
router.delete('/:id/matches/:matchId/schedule-agreed', clearMatchScheduleAgreed);
router.post('/:id/matches/:matchId/reserve', reserveMatchSchedule);
router.patch('/:id/matches/:matchId/admin-schedule', adminUpdateMatchSchedule);
router.get('/:id/matches/:matchId/messages', getMatchMessages);
router.post('/:id/matches/:matchId/messages', sendMatchMessage);
router.post('/:id/matches/:matchId/messages/:messageId/respond', respondMatchRequest);
router.get('/:id/rounds', getTournamentRounds);
router.patch('/:id/rounds/:roundId', updateTournamentRound);
router.put('/:id/rounds/:roundId/availability', upsertRoundAvailability);
router.get('/:id/rounds/:roundId/availabilities', getRoundAvailabilities);
router.post('/:id/rounds/:roundId/generate-matching', generateRoundMatching);
router.put('/:id/rounds/:roundId/proposed-matches', setRoundProposedMatches);
router.post('/:id/rounds/:roundId/approve-matching', approveRoundMatching);
router.patch('/:id/playoff-round-deadline',  assignPlayoffRoundDeadline);
router.post('/:id/extend-round',             extendRoundDeadline);
router.post('/:id/matches/:matchId/extend',  extendMatchDeadline);
router.post('/:id/draw-unscored',            drawUnscoredMatches);
router.patch('/:id',                         updateTournament);
router.delete('/:id',                        deleteTournament);

export default router;
