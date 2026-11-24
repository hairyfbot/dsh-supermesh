-- AlterTable
ALTER TABLE "inbox" ADD COLUMN "answerRelayedAt" TEXT;

-- 已经答过、也早已被消费的历史答案不算待投递：不补这一列，升级后第一轮就会把它们
-- 当成新答案重新播报一遍。
UPDATE "inbox" SET "answerRelayedAt" = COALESCE("answeredAt", "doneAt", "createdAt") WHERE "answer" IS NOT NULL;
