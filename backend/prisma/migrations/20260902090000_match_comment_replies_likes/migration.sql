-- Maç/ilan yorumlarına da medya yorumlarındaki gibi yanıt (tek seviye) ve beğeni eklendi.
ALTER TABLE "MatchComment" ADD COLUMN "parentId" TEXT;

CREATE TABLE "MatchCommentLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchCommentLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchCommentLike_userId_commentId_key" ON "MatchCommentLike"("userId", "commentId");

ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MatchComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchCommentLike" ADD CONSTRAINT "MatchCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchCommentLike" ADD CONSTRAINT "MatchCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "MatchComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
