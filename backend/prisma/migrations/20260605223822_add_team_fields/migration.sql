-- AlterTable
ALTER TABLE "ActivityRequest" ADD COLUMN     "senderTeam" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "RivalJoinRequest" ADD COLUMN     "joiningTeam" JSONB NOT NULL DEFAULT '[]';
