-- CreateEnum
CREATE TYPE "BenchmarkJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "benchmark_jobs" (
    "id" TEXT NOT NULL,
    "patch" TEXT NOT NULL,
    "rank_tier" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" "BenchmarkJobStatus" NOT NULL DEFAULT 'pending',
    "seed_puuids" JSONB NOT NULL DEFAULT '[]',
    "pending_match_ids" JSONB NOT NULL DEFAULT '[]',
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benchmark_jobs_status_created_at_idx" ON "benchmark_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_jobs_patch_rank_tier_key" ON "benchmark_jobs"("patch", "rank_tier");
