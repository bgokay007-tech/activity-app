import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
    createTournament,
    getTournaments,
    joinTournament,
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
} from '../controllers/tournament.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',                              getTournaments);
router.get('/archived',                      getArchivedTournaments);
router.post('/',                             createTournament);
router.post('/:id/join',                     joinTournament);
router.delete('/:id/join',                   cancelJoin);
router.post('/:id/cancel-request',           requestCancellation);
router.post('/:id/complete',                 completeTournament);
router.get('/:id/participants',               getParticipants);
router.get('/:id/requests',                  getJoinRequests);
router.patch('/:id/requests/:userId',        updateJoinRequest);
router.post('/:id/start',                    startTournament);
router.get('/:id/matches',                   getTournamentMatches);
router.patch('/:id/matches/:matchId/score',  enterTournamentMatchScore);
router.patch('/:id',                         updateTournament);
router.delete('/:id',                        deleteTournament);

export default router;
