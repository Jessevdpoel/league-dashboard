-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('single', 'trend');

-- CreateTable
CREATE TABLE "matches_raw" (
    "match_id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "patch" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_json" JSONB NOT NULL,

    CONSTRAINT "matches_raw_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "timelines_raw" (
    "match_id" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_json" JSONB NOT NULL,

    CONSTRAINT "timelines_raw_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "participant_facts" (
    "match_id" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "champion_id" INTEGER NOT NULL,
    "patch" TEXT NOT NULL,
    "rank_tier" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_facts_pkey" PRIMARY KEY ("match_id","puuid")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "match_id" TEXT,
    "type" "AnalysisType" NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "input_facts" JSONB NOT NULL,
    "output_json" JSONB NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmarks" (
    "patch" TEXT NOT NULL,
    "rank_tier" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "p25" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "p90" DOUBLE PRECISION NOT NULL,
    "sample_n" INTEGER NOT NULL,

    CONSTRAINT "benchmarks_pkey" PRIMARY KEY ("patch","rank_tier","role","metric_name")
);

-- CreateIndex
CREATE INDEX "participant_facts_patch_rank_tier_role_idx" ON "participant_facts"("patch", "rank_tier", "role");

-- CreateIndex
CREATE INDEX "analyses_created_at_idx" ON "analyses"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_puuid_match_id_type_prompt_version_key" ON "analyses"("puuid", "match_id", "type", "prompt_version");

