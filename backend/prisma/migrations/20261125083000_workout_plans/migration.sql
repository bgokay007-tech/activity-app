-- Fitness Antremanım: plan / hareket / oturum / set log
CREATE TABLE "WorkoutPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "coachListingId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'SPORTS',
    "subCategory" TEXT NOT NULL DEFAULT 'fitness_gym',
    "title" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutExercise" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "setScheme" TEXT NOT NULL DEFAULT 'STRAIGHT',
    "targetSets" INTEGER,
    "targetReps" TEXT,
    "targetWeight" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "dayIndex" INTEGER,
    "notes" TEXT,
    "schemeMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSetLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "dropIndex" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSetLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutPlan_userId_status_createdAt_idx" ON "WorkoutPlan"("userId", "status", "createdAt");
CREATE INDEX "WorkoutPlan_authorId_createdAt_idx" ON "WorkoutPlan"("authorId", "createdAt");
CREATE INDEX "WorkoutExercise_planId_sortOrder_idx" ON "WorkoutExercise"("planId", "sortOrder");
CREATE UNIQUE INDEX "WorkoutSession_planId_userId_date_key" ON "WorkoutSession"("planId", "userId", "date");
CREATE INDEX "WorkoutSession_userId_date_idx" ON "WorkoutSession"("userId", "date");
CREATE UNIQUE INDEX "WorkoutSetLog_sessionId_exerciseId_setIndex_dropIndex_key" ON "WorkoutSetLog"("sessionId", "exerciseId", "setIndex", "dropIndex");
CREATE INDEX "WorkoutSetLog_exerciseId_idx" ON "WorkoutSetLog"("exerciseId");

ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_coachListingId_fkey" FOREIGN KEY ("coachListingId") REFERENCES "CoachListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSetLog" ADD CONSTRAINT "WorkoutSetLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSetLog" ADD CONSTRAINT "WorkoutSetLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
