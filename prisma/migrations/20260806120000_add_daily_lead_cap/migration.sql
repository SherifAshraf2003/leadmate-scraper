-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyLeadLimit" INTEGER NOT NULL DEFAULT 200;

-- CreateTable
CREATE TABLE "ScrapeUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "leads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScrapeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeUsage_userId_day_key" ON "ScrapeUsage"("userId", "day");

-- AddForeignKey
ALTER TABLE "ScrapeUsage" ADD CONSTRAINT "ScrapeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

