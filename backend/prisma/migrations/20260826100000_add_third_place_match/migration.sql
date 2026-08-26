-- AlterTable
ALTER TABLE "TournamentMatch" ADD COLUMN "isThirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TournamentMatch" ADD COLUMN "p1ThirdPlaceAccepted" BOOLEAN;
ALTER TABLE "TournamentMatch" ADD COLUMN "p2ThirdPlaceAccepted" BOOLEAN;
