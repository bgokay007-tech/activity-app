-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN "substitutePlayers" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "RivalJoinRequest" ADD COLUMN "isSubstituteInvite" BOOLEAN NOT NULL DEFAULT false;
