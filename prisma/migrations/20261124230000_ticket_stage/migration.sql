-- 票的阶段与官方对齐：waiting 拆成 queued（还没派工）与 idle（跑过一轮、等新触发）。
-- 有 Worker 记录说明已经派过工，其余是还没派工的新票。
UPDATE "ticket" SET "status" = 'idle' WHERE "status" = 'waiting' AND EXISTS (SELECT 1 FROM "worker" WHERE "worker"."ticketId" = "ticket"."id");
UPDATE "ticket" SET "status" = 'queued' WHERE "status" = 'waiting';
