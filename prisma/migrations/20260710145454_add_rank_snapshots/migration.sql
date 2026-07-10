-- CreateTable
CREATE TABLE "rank_snapshots" (
    "id" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "queueType" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "leaguePoints" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rank_snapshots_puuid_queueType_recordedAt_idx" ON "rank_snapshots"("puuid", "queueType", "recordedAt");
