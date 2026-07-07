-- CreateTable
CREATE TABLE "riot_id_index" (
    "puuid" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "game_name" TEXT NOT NULL,
    "game_name_normalized" TEXT NOT NULL,
    "tag_line" TEXT NOT NULL,
    "seen_count" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riot_id_index_pkey" PRIMARY KEY ("puuid")
);

-- CreateIndex
CREATE INDEX "riot_id_index_region_game_name_normalized_idx" ON "riot_id_index"("region", "game_name_normalized");
