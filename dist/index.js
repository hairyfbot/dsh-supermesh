import process from "node:process";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@fileshed/kysely-node-sqlite";
import { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { Model } from "kysely-model";
import { createStorage } from "unstorage";
import fs from "unstorage/drivers/fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { createRouteDispatcher, proxyEnvironmentForChild } from "@deepseek-ai/dsh-http-proxy";
import { getServerContext, getServerOptions } from "dsh-h3/utils";
import { fetch } from "undici";
import { defineWebServer } from "dsh-h3";
import { HTTPError, defineHandler, getRouterParam, readBody } from "h3";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { lstat, mkdir, readFile, realpath, rename as rename$1, rm, writeFile } from "node:fs/promises";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { StringDecoder } from "node:string_decoder";
import { promisify, stripVTControlCharacters } from "node:util";
import { Cron } from "croner";
// src/ai/_shared/plugins/index.ts
const IS_WINDOWS = process.platform === "win32";
const agentInstructions = {
	id: "agent-instructions",
	name: "@deepseek-ai/dsh-agent-instructions",
	config: { maxBytes: 65536 }
};
const timeContext = {
	id: "time-context",
	name: "@deepseek-ai/dsh-time-context"
};
const toolBash = {
	id: "tool-bash",
	name: "@deepseek-ai/dsh-tool-bash",
	disabled: IS_WINDOWS
};
const toolPwsh = {
	id: "tool-pwsh",
	name: "@deepseek-ai/dsh-tool-pwsh",
	disabled: !IS_WINDOWS
};
const toolFs = {
	id: "tool-fs",
	name: "@deepseek-ai/dsh-tool-fs",
	config: { applyPatch: false }
};
const toolFsSearch = {
	id: "tool-fs-search",
	name: "@deepseek-ai/dsh-tool-fs-search",
	config: { sampleOverCapGlobResults: false }
};
const toolJobs = {
	id: "tool-jobs",
	name: "@deepseek-ai/dsh-tool-jobs"
};
const skillFilesystem = {
	id: "skill-filesystem",
	name: "@deepseek-ai/dsh-skill-filesystem"
};
const toolSkill = {
	id: "tool-skill",
	name: "@deepseek-ai/dsh-tool-skill"
};
const commandGoal = {
	id: "command-goal",
	name: "@deepseek-ai/dsh-command-goal"
};
const compaction = {
	id: "compaction",
	name: "cordis:group",
	group: true,
	isolate: {
		compaction: true,
		toolResultPruner: true
	},
	config: [
		{
			id: "compaction-basic",
			name: "@deepseek-ai/dsh-compaction-basic"
		},
		{
			id: "command-compact",
			name: "@deepseek-ai/dsh-command-compact"
		},
		{
			id: "tool-result-pruner",
			name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
			config: {
				thresholdChars: 8192,
				headChars: 4096,
				tailChars: 1024
			}
		}
	]
};
const delegation = {
	id: "delegation",
	name: "cordis:group",
	group: true,
	isolate: { workflowEngine: true },
	config: [
		{
			id: "tool-subagent-control",
			name: "@deepseek-ai/dsh-tool-subagent-control"
		},
		{
			id: "tool-subagent",
			name: "@deepseek-ai/dsh-tool-subagent",
			config: {
				provider: "spawn",
				toolName: "subagent",
				modelSelection: true,
				modelDiscovery: true
			}
		},
		{
			id: "tool-subagent-fork",
			name: "@deepseek-ai/dsh-tool-subagent",
			config: {
				provider: "fork",
				toolName: "subagent_fork"
			}
		},
		{
			id: "workflow-ptc",
			name: "@deepseek-ai/dsh-workflow-ptc",
			disabled: true,
			config: { provider: "spawn" }
		},
		{
			id: "tool-workflow",
			name: "@deepseek-ai/dsh-tool-workflow",
			disabled: true
		}
	]
};
const toolTodo = {
	id: "tool-todo",
	name: "@deepseek-ai/dsh-tool-todo",
	config: { allowParallelInProgress: true }
};
const toolWeb = {
	id: "tool-web",
	name: "@deepseek-ai/dsh-tool-web",
	config: {
		fetch: true,
		searchTimeoutMs: 6e4
	}
};
const toolExecutorPtc = {
	id: "tool-executor-ptc",
	name: "@deepseek-ai/dsh-tool-executor-ptc"
};
const toolPresent = {
	id: "present",
	name: "@deepseek-ai/dsh-tool-present"
};
// src/database/migrations.ts
/**
* 由 `pnpm run prisma:migrate` 从 `prisma/migrations` 搬运，不要手改。
*
* 一个键就是一个 Prisma 迁移目录，值是它 `migration.sql` 的全文。
*/
const migrations = {
	"20261113135519": `
    -- CreateTable
    CREATE TABLE "channel" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "host" TEXT,
        "createdAt" TEXT NOT NULL
    );

    -- CreateTable
    CREATE TABLE "channel_account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "channelId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "avatar" TEXT,
        "status" TEXT NOT NULL DEFAULT 'offline',
        "createdAt" TEXT NOT NULL,
        CONSTRAINT "channel_account_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "ci_watch" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "channelId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "ref" TEXT NOT NULL,
        "fingerprint" TEXT NOT NULL,
        "revision" INTEGER NOT NULL DEFAULT 0,
        "head" TEXT,
        "updatedAt" TEXT NOT NULL,
        CONSTRAINT "ci_watch_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "source_state" (
        "channelId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,

        PRIMARY KEY ("channelId", "name"),
        CONSTRAINT "source_state_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "inbox" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "seq" BIGINT NOT NULL,
        "type" TEXT NOT NULL,
        "projectId" TEXT,
        "supervisorId" TEXT,
        "origin" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "kind" TEXT NOT NULL,
        "title" TEXT,
        "message" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "doneAt" TEXT,
        "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
        "deliveryError" TEXT,
        "nextRetryAt" TEXT,
        "readAt" TEXT,
        "escalations" INTEGER NOT NULL DEFAULT 0,
        "lastEscalatedAt" TEXT,
        "answer" TEXT,
        "answeredBy" TEXT,
        "answeredAt" TEXT,
        "triggerId" TEXT,
        "threadId" TEXT,
        "ticketId" TEXT,
        "workerId" TEXT,
        CONSTRAINT "inbox_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "inbox_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "inbox_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "trigger" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "inbox_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "inbox_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "inbox_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "project" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "channelId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "directory" TEXT NOT NULL,
        "orchestratorSessionId" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        CONSTRAINT "project_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "setting" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "maxWorkers" INTEGER NOT NULL DEFAULT 4,
        "backgroundLimitMinutes" INTEGER NOT NULL DEFAULT 30,
        "autoMerge" BOOLEAN NOT NULL DEFAULT false,
        "autoMergeMaxLines" INTEGER NOT NULL DEFAULT 200,
        "deliveryMaxAttempts" INTEGER NOT NULL DEFAULT 3,
        "deliveryRetryCeilingSeconds" INTEGER NOT NULL DEFAULT 60,
        "updatedAt" TEXT NOT NULL
    );

    -- CreateTable
    CREATE TABLE "supervisor" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sessionId" TEXT,
        "title" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TEXT NOT NULL,
        "closedAt" TEXT
    );

    -- CreateTable
    CREATE TABLE "supervisor_ticket" (
        "supervisorId" TEXT NOT NULL,
        "ticketId" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,

        PRIMARY KEY ("supervisorId", "ticketId"),
        CONSTRAINT "supervisor_ticket_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "supervisor_ticket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "thread" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "channelId" TEXT NOT NULL,
        "projectId" TEXT,
        "refId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "url" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        "triage" TEXT NOT NULL DEFAULT 'pending',
        "triagedAt" TEXT,
        CONSTRAINT "thread_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "trigger" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "channelId" TEXT NOT NULL,
        "threadId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "actorName" TEXT,
        "human" BOOLEAN NOT NULL DEFAULT true,
        "mentioned" BOOLEAN NOT NULL DEFAULT false,
        "text" TEXT NOT NULL,
        "url" TEXT,
        "at" TEXT NOT NULL,
        "ref" TEXT,
        CONSTRAINT "trigger_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "trigger_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "ticket" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "channelId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "status" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        "startedAt" TEXT,
        "endedAt" TEXT,
        "prUrl" TEXT,
        "prState" TEXT,
        "ciState" TEXT,
        "paused" BOOLEAN NOT NULL DEFAULT false,
        "prepareError" TEXT,
        CONSTRAINT "ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ticket_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "ticket_thread" (
        "ticketId" TEXT NOT NULL,
        "threadId" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,

        PRIMARY KEY ("ticketId", "threadId"),
        CONSTRAINT "ticket_thread_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ticket_thread_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "ticket_link" (
        "ticketId" TEXT NOT NULL,
        "relatedId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,

        PRIMARY KEY ("ticketId", "relatedId", "kind"),
        CONSTRAINT "ticket_link_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ticket_link_relatedId_fkey" FOREIGN KEY ("relatedId") REFERENCES "ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateTable
    CREATE TABLE "worker" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "ticketId" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "startedAt" TEXT,
        "endedAt" TEXT,
        "title" TEXT,
        "endedReason" TEXT,
        "branch" TEXT,
        "worktree" TEXT,
        "reportState" TEXT,
        "report" TEXT,
        "reportAt" TEXT,
        "backgroundUntil" TEXT,
        "recoveryNote" TEXT,
        CONSTRAINT "worker_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    -- CreateIndex
    CREATE INDEX "channel_account_channelId_role_idx" ON "channel_account"("channelId", "role");

    -- CreateIndex
    CREATE UNIQUE INDEX "channel_account_channelId_role_name_key" ON "channel_account"("channelId", "role", "name");

    -- CreateIndex
    CREATE UNIQUE INDEX "ci_watch_channelId_kind_ref_key" ON "ci_watch"("channelId", "kind", "ref");

    -- CreateIndex
    CREATE INDEX "source_state_updatedAt_idx" ON "source_state"("updatedAt");

    -- CreateIndex
    CREATE INDEX "inbox_type_projectId_status_idx" ON "inbox"("type", "projectId", "status");

    -- CreateIndex
    CREATE INDEX "inbox_type_status_createdAt_idx" ON "inbox"("type", "status", "createdAt");

    -- CreateIndex
    CREATE INDEX "inbox_status_createdAt_idx" ON "inbox"("status", "createdAt");

    -- CreateIndex
    CREATE INDEX "inbox_ticketId_seq_idx" ON "inbox"("ticketId", "seq");

    -- CreateIndex
    CREATE INDEX "inbox_status_nextRetryAt_idx" ON "inbox"("status", "nextRetryAt");

    -- CreateIndex
    CREATE UNIQUE INDEX "project_workspaceId_key" ON "project"("workspaceId");

    -- CreateIndex
    CREATE UNIQUE INDEX "project_channelId_name_key" ON "project"("channelId", "name");

    -- CreateIndex
    CREATE INDEX "supervisor_status_idx" ON "supervisor"("status");

    -- CreateIndex
    CREATE INDEX "supervisor_ticket_ticketId_idx" ON "supervisor_ticket"("ticketId");

    -- CreateIndex
    CREATE INDEX "thread_updatedAt_idx" ON "thread"("updatedAt");

    -- CreateIndex
    CREATE INDEX "thread_projectId_idx" ON "thread"("projectId");

    -- CreateIndex
    CREATE INDEX "thread_triage_idx" ON "thread"("triage");

    -- CreateIndex
    CREATE UNIQUE INDEX "thread_channelId_refId_key" ON "thread"("channelId", "refId");

    -- CreateIndex
    CREATE INDEX "trigger_threadId_at_idx" ON "trigger"("threadId", "at");

    -- CreateIndex
    CREATE INDEX "trigger_channelId_at_idx" ON "trigger"("channelId", "at");

    -- CreateIndex
    CREATE INDEX "trigger_at_idx" ON "trigger"("at");

    -- CreateIndex
    CREATE INDEX "trigger_ref_idx" ON "trigger"("ref");

    -- CreateIndex
    CREATE INDEX "ticket_projectId_status_idx" ON "ticket"("projectId", "status");

    -- CreateIndex
    CREATE INDEX "ticket_status_updatedAt_idx" ON "ticket"("status", "updatedAt");

    -- CreateIndex
    CREATE INDEX "ticket_thread_ticketId_createdAt_idx" ON "ticket_thread"("ticketId", "createdAt");

    -- CreateIndex
    CREATE INDEX "ticket_thread_threadId_idx" ON "ticket_thread"("threadId");

    -- CreateIndex
    CREATE INDEX "ticket_link_relatedId_idx" ON "ticket_link"("relatedId");

    -- CreateIndex
    CREATE INDEX "worker_ticketId_createdAt_idx" ON "worker"("ticketId", "createdAt");

    -- CreateIndex
    CREATE INDEX "worker_status_idx" ON "worker"("status");
  `,
	"20261117170000_project_workspace": `
    -- RedefineTables
    PRAGMA defer_foreign_keys=ON;
    PRAGMA foreign_keys=OFF;
    CREATE TABLE "new_project" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "directory" TEXT NOT NULL,
        "remoteUrl" TEXT,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "orchestratorSessionId" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
    );
    INSERT INTO "new_project" ("createdAt", "directory", "id", "name", "orchestratorSessionId", "updatedAt", "workspaceId") SELECT "createdAt", "directory", "id", "name", "orchestratorSessionId", "updatedAt", "workspaceId" FROM "project";
    DROP TABLE "project";
    ALTER TABLE "new_project" RENAME TO "project";
    CREATE UNIQUE INDEX "project_workspaceId_key" ON "project"("workspaceId");
    PRAGMA foreign_keys=ON;
    PRAGMA defer_foreign_keys=OFF;
  `
};
// src/database/models/channel.ts
var Channel = class extends Model {
	constructor(db) {
		super(db, "channel", "id");
	}
	async saveConfiguration(id, name, host, enabled, metadata, account, resetAdmins = false) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		await this.db.transaction().execute(async (trx) => {
			await trx.insertInto("channel").values({
				id,
				name,
				host,
				enabled: enabled ? 1 : 0,
				createdAt: now
			}).onConflict((oc) => oc.column("id").doUpdateSet({
				name,
				host,
				enabled: enabled ? 1 : 0
			})).execute();
			await trx.insertInto("source_state").values({
				channelId: id,
				name: "configuration",
				value: JSON.stringify(metadata),
				updatedAt: now
			}).onConflict((oc) => oc.columns(["channelId", "name"]).doUpdateSet({
				value: JSON.stringify(metadata),
				updatedAt: now
			})).execute();
			if (resetAdmins && id === "gitlab") await trx.deleteFrom("channel_account").where("channelId", "=", id).where("role", "=", "admin").execute();
			if (account) {
				await trx.deleteFrom("channel_account").where("channelId", "=", id).where("role", "=", "bot").execute();
				await trx.insertInto("channel_account").values({
					id: `${id}:bot`,
					channelId: id,
					role: "bot",
					name: account.name,
					avatar: account.avatar,
					status: "online",
					createdAt: now
				}).execute();
			}
		});
	}
	async removeCredentials(id) {
		await this.db.transaction().execute(async (trx) => {
			await trx.updateTable("channel").set({ enabled: 0 }).where("id", "=", id).execute();
			await trx.deleteFrom("channel_account").where("channelId", "=", id).where("role", "=", "bot").execute();
			await trx.updateTable("channel_account").set({ status: "offline" }).where("channelId", "=", id).where("role", "=", "admin").execute();
		});
	}
	async findEnabled() {
		return this.db.selectFrom("channel").selectAll().where("enabled", "=", 1).orderBy("id").execute();
	}
	async setEnabled(id, enabled) {
		await this.db.updateTable("channel").set({ enabled: enabled ? 1 : 0 }).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("channel").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listAll() {
		return this.db.selectFrom("channel").selectAll().orderBy("id").execute();
	}
};
// src/database/models/channel-account.ts
var ChannelAccount = class extends Model {
	constructor(db) {
		super(db, "channel_account", "id");
	}
	async findByChannel(channelId) {
		return this.db.selectFrom("channel_account").selectAll().where("channelId", "=", channelId).orderBy("role").orderBy("name").execute();
	}
	async findByRole(channelId, role) {
		return this.db.selectFrom("channel_account").selectAll().where("channelId", "=", channelId).where("role", "=", role).orderBy("name").execute();
	}
	async findByName(channelId, role, name) {
		return this.db.selectFrom("channel_account").selectAll().where("channelId", "=", channelId).where("role", "=", role).where("name", "=", name).executeTakeFirst();
	}
	async setStatus(id, status) {
		await this.db.updateTable("channel_account").set({ status }).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("channel_account").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listAll() {
		return this.db.selectFrom("channel_account").selectAll().orderBy("id").execute();
	}
};
// src/database/models/ci-watch.ts
var CiWatch = class CiWatch extends Model {
	constructor(db) {
		super(db, "ci_watch", "id");
	}
	async findTarget(channelId, kind, ref) {
		return this.db.selectFrom("ci_watch").selectAll().where("channelId", "=", channelId).where("kind", "=", kind).where("ref", "=", ref).executeTakeFirst();
	}
	async listByChannel(channelId) {
		return this.db.selectFrom("ci_watch").selectAll().where("channelId", "=", channelId).orderBy("ref").execute();
	}
	async rotate(id, fingerprint, updatedAt, head = null) {
		await this.db.updateTable("ci_watch").set((eb) => ({
			fingerprint,
			head,
			updatedAt,
			revision: eb("revision", "+", 1)
		})).where("id", "=", id).execute();
	}
	async recordRevision(value) {
		return this.db.transaction().execute(async (trx) => {
			const model = new CiWatch(trx);
			const previous = await model.findTarget(value.channelId, value.kind, value.ref);
			if (!previous) {
				await model.create({
					...value,
					revision: 0
				});
				return {
					row: await model.findTarget(value.channelId, value.kind, value.ref),
					changed: true
				};
			}
			const changed = previous.fingerprint !== value.fingerprint || previous.head !== (value.head ?? null);
			if (changed) await model.rotate(previous.id, value.fingerprint, value.updatedAt, value.head ?? null);
			return {
				row: await model.findTarget(value.channelId, value.kind, value.ref),
				changed
			};
		});
	}
};
// src/database/models/inbox.ts
var Inbox = class Inbox extends Model {
	constructor(db) {
		super(db, "inbox", "id");
	}
	async nextSeq() {
		const row = await this.db.selectFrom("inbox").select(this.db.fn.max("seq").as("max")).executeTakeFirst();
		return Number(row?.max ?? 0) + 1;
	}
	async listPending(type, projectId) {
		const query = this.db.selectFrom("inbox").selectAll().where("type", "=", type).where("status", "=", "pending");
		return (projectId === void 0 ? query : query.where("projectId", "=", projectId)).orderBy("seq").execute();
	}
	async countPending(type, projectId) {
		const query = this.db.selectFrom("inbox").select(this.db.fn.countAll().as("count")).where("type", "=", type).where("status", "=", "pending");
		const row = await (projectId === void 0 ? query : query.where("projectId", "=", projectId)).executeTakeFirst();
		return Number(row?.count ?? 0);
	}
	async listPendingAsk() {
		return this.db.selectFrom("inbox").selectAll().where("type", "=", "user").where("kind", "=", "ask").where("status", "=", "pending").orderBy("createdAt").execute();
	}
	async markRead(ids, readAt) {
		if (ids.length === 0) return;
		await this.db.updateTable("inbox").set({ readAt }).where("id", "in", ids).execute();
	}
	async markDone(id, doneAt) {
		await this.db.updateTable("inbox").set({
			status: "done",
			doneAt
		}).where("id", "=", id).execute();
	}
	async answer(id, answer, answeredBy, answeredAt) {
		await this.db.updateTable("inbox").set({
			answer,
			answeredBy,
			answeredAt,
			status: "done",
			doneAt: answeredAt
		}).where("id", "=", id).execute();
	}
	async recordDeliveryFailure(id, deliveryError, nextRetryAt) {
		await this.db.updateTable("inbox").set((eb) => ({
			deliveryAttempts: eb("deliveryAttempts", "+", 1),
			deliveryError,
			nextRetryAt
		})).where("id", "=", id).execute();
	}
	async resetDelivery(id) {
		await this.db.updateTable("inbox").set({
			deliveryAttempts: 0,
			deliveryError: null,
			nextRetryAt: null
		}).where("id", "=", id).execute();
	}
	async markStalled(id, deliveryError) {
		await this.db.updateTable("inbox").set({
			status: "stalled",
			deliveryError,
			nextRetryAt: null
		}).where("id", "=", id).execute();
	}
	async listRetryable(now) {
		return this.db.selectFrom("inbox").selectAll().where("status", "=", "pending").where("nextRetryAt", "is not", null).where("nextRetryAt", "<=", now).orderBy("nextRetryAt").execute();
	}
	async escalate(id, lastEscalatedAt) {
		await this.db.updateTable("inbox").set((eb) => ({
			escalations: eb("escalations", "+", 1),
			lastEscalatedAt
		})).where("id", "=", id).execute();
	}
	async reassign(id, type, refs = {}) {
		await this.db.updateTable("inbox").set({
			type,
			...refs
		}).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("inbox").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listRecent(limit = 100) {
		return this.db.selectFrom("inbox").selectAll().orderBy("createdAt", "desc").orderBy("id").limit(Math.max(1, Math.min(1e3, limit))).execute();
	}
	async enqueue(value) {
		if (![
			"user",
			"main",
			"project",
			"supervisor"
		].includes(value.type)) throw new Error("invalid_inbox_recipient");
		const insert = async (trx) => {
			const model = new Inbox(trx);
			if (value.id) {
				const existing = await model.findById(value.id);
				if (existing) return existing;
			}
			const id = value.id ?? randomUUID();
			await model.create({
				id,
				seq: await model.nextSeq(),
				status: "pending",
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				projectId: null,
				supervisorId: null,
				title: null,
				doneAt: null,
				deliveryError: null,
				nextRetryAt: null,
				readAt: null,
				lastEscalatedAt: null,
				answer: null,
				answeredBy: null,
				answeredAt: null,
				triggerId: null,
				threadId: null,
				ticketId: null,
				workerId: null,
				...value
			});
			return await model.findById(id);
		};
		return this.db.isTransaction ? insert(this.db) : this.db.transaction().execute(insert);
	}
	async listByTicket(ticketId) {
		return this.db.selectFrom("inbox").selectAll().where("ticketId", "=", ticketId).orderBy("createdAt").orderBy("seq").execute();
	}
	async listScoped(scope, includeChannel = false) {
		if (![
			"main",
			"project",
			"supervisor"
		].includes(scope.type)) throw new Error("invalid_inbox_recipient");
		let query = this.db.selectFrom("inbox").selectAll().where("type", "=", scope.type).where("status", "in", ["pending", "stalled"]);
		if (!includeChannel) query = query.where("origin", "!=", "channel");
		if (scope.type === "project") query = query.where("projectId", "=", scope.projectId);
		if (scope.type === "supervisor") query = query.where("supervisorId", "=", scope.supervisorId);
		return query.orderBy("createdAt").orderBy("seq").execute();
	}
	owns(row, scope, includeChannel = false) {
		return [
			"main",
			"project",
			"supervisor"
		].includes(scope.type) && (includeChannel || row.origin !== "channel") && row.type === scope.type && (scope.type !== "project" || row.projectId === scope.projectId) && (scope.type !== "supervisor" || row.supervisorId === scope.supervisorId);
	}
	async completeScoped(ids, scope, now, includeChannel = false) {
		if (!ids.length) return 0;
		return this.db.transaction().execute(async (trx) => {
			const model = new Inbox(trx);
			const rows = await trx.selectFrom("inbox").selectAll().where("id", "in", [...new Set(ids)]).execute();
			if (rows.length !== new Set(ids).size || rows.some((row) => !model.owns(row, scope, includeChannel))) throw new Error("收件箱不存在或不属于当前身份");
			if (rows.some((row) => row.kind === "ask" && row.status !== "done")) throw new Error("answer_required");
			const result = await trx.updateTable("inbox").set({
				status: "done",
				doneAt: now
			}).where("id", "in", ids).where("status", "in", ["pending", "stalled"]).executeTakeFirst();
			return Number(result.numUpdatedRows);
		});
	}
	async answerScoped(id, text, scope, now) {
		return this.db.transaction().execute(async (trx) => {
			const model = new Inbox(trx);
			const row = await model.findById(id);
			if (!row || !model.owns(row, scope) || row.kind !== "ask" || row.status === "done") throw new Error("只能回答指向当前身份的 pending ask");
			await model.answer(id, text, scope.type, now);
			return row;
		});
	}
	async escalateScoped(id, scope, now) {
		return this.db.transaction().execute(async (trx) => {
			const model = new Inbox(trx);
			const row = await model.findById(id);
			if (!row || !model.owns(row, scope) || row.kind !== "ask" || row.status === "done") throw new Error("只能升级指向当前身份的 pending ask");
			if (scope.type === "main") throw new Error("主编排应通过 ask_user 询问人，不能自动升级");
			const supervisor = scope.type === "project" && row.ticketId ? await trx.selectFrom("supervisor_ticket").innerJoin("supervisor", "supervisor.id", "supervisor_ticket.supervisorId").select("supervisor.id").where("ticketId", "=", row.ticketId).where("supervisor.status", "=", "active").orderBy("supervisor.createdAt").executeTakeFirst() : void 0;
			await trx.updateTable("inbox").set((eb) => ({
				type: supervisor ? "supervisor" : "main",
				supervisorId: supervisor?.id ?? (row.origin === "supervisor" ? row.supervisorId : null),
				escalations: eb("escalations", "+", 1),
				lastEscalatedAt: now,
				readAt: null
			})).where("id", "=", id).execute();
			return await model.findById(id);
		});
	}
	async answerByUser(id, answer, answeredAt) {
		return this.db.updateTable("inbox").set({
			answer,
			answeredBy: "user",
			answeredAt,
			status: "done",
			doneAt: answeredAt
		}).where("id", "=", id).where("type", "=", "user").where("kind", "=", "ask").where("status", "=", "pending").returningAll().executeTakeFirst();
	}
	async enqueueAnswer(row) {
		if (!row.answer || !row.answeredBy || row.answeredBy === "user" || row.origin !== "main" && row.origin !== "project" && row.origin !== "supervisor") return;
		await this.enqueue({
			id: `nexus:answer:${row.id}`,
			type: row.origin,
			origin: row.answeredBy,
			kind: "notice",
			title: row.title,
			message: row.answer,
			projectId: row.projectId,
			supervisorId: row.supervisorId,
			ticketId: row.ticketId,
			workerId: row.workerId,
			threadId: row.threadId,
			triggerId: row.triggerId
		});
	}
	async listAnswered() {
		return this.db.selectFrom("inbox").selectAll().where("kind", "=", "ask").where("status", "=", "done").where("answer", "is not", null).orderBy("seq").execute();
	}
	async returnPendingTicket(ticketId, reason, now) {
		await this.db.updateTable("inbox").set({
			status: "stalled",
			deliveryError: reason,
			nextRetryAt: null,
			doneAt: now
		}).where("ticketId", "=", ticketId).where("status", "=", "pending").execute();
	}
	async listDelivery() {
		return this.db.selectFrom("inbox").selectAll().where("type", "in", [
			"main",
			"project",
			"supervisor"
		]).where("status", "in", ["pending", "stalled"]).orderBy("seq").execute();
	}
	async listOutgoing() {
		return this.db.selectFrom("inbox").selectAll().where("type", "=", "user").where("triggerId", "is not", null).where("kind", "in", ["notice", "ask"]).where("status", "in", ["pending", "stalled"]).orderBy("seq").execute();
	}
	async enqueueAsk(value) {
		return this.db.transaction().execute(async (trx) => {
			let query = trx.selectFrom("inbox").selectAll().where("kind", "=", "ask").where("status", "=", "pending").where("origin", "=", value.origin);
			if (value.workerId) query = query.where("workerId", "=", value.workerId);
			else if (value.origin === "project" && value.ticketId) query = query.where("projectId", value.projectId ? "=" : "is", value.projectId ?? null).where("ticketId", "=", value.ticketId);
			else query = query.where("projectId", value.projectId ? "=" : "is", value.projectId ?? null).where("supervisorId", value.supervisorId ? "=" : "is", value.supervisorId ?? null).where("triggerId", value.triggerId ? "=" : "is", value.triggerId ?? null).where("message", "=", value.message);
			const pending = await query.executeTakeFirst();
			if (pending) {
				if (pending.message !== value.message) throw new Error(`当前工作线已有 pending ask：${pending.id}`);
				return pending;
			}
			return new Inbox(trx).enqueue({
				...value,
				kind: "ask"
			});
		});
	}
};
// src/database/models/project.ts
var Project = class extends Model {
	constructor(db) {
		super(db, "project", "id");
	}
	async findByWorkspace(workspaceId) {
		return this.db.selectFrom("project").selectAll().where("workspaceId", "=", workspaceId).executeTakeFirst();
	}
	async setOrchestrator(id, orchestratorSessionId, updatedAt) {
		await this.db.updateTable("project").set({
			orchestratorSessionId,
			updatedAt
		}).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("project").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listAll() {
		return this.db.selectFrom("project").selectAll().orderBy("id").execute();
	}
	async findBySession(sessionId) {
		const rows = await this.db.selectFrom("project").selectAll().where("orchestratorSessionId", "=", sessionId).limit(2).execute();
		if (rows.length > 1) throw new Error("session_binding_conflict");
		return rows[0];
	}
	async findByRemote(remoteUrl) {
		return this.db.selectFrom("project").selectAll().where("remoteUrl", "=", remoteUrl).executeTakeFirst();
	}
	async setEnabled(id, enabled, updatedAt) {
		let query = this.db.updateTable("project").set({
			enabled: enabled ? 1 : 0,
			updatedAt
		}).where("id", "=", id);
		if (enabled) query = query.where("remoteUrl", "is not", null).where("remoteUrl", "!=", "");
		return query.returningAll().executeTakeFirst();
	}
	async upsertWorkspace(value, updatedAt) {
		return this.db.insertInto("project").values({
			...value,
			enabled: value.remoteUrl?.trim() ? 1 : 0,
			orchestratorSessionId: null,
			createdAt: updatedAt,
			updatedAt
		}).onConflict((oc) => oc.column("workspaceId").doUpdateSet({
			name: value.name,
			directory: value.directory,
			remoteUrl: value.remoteUrl,
			updatedAt
		})).returningAll().executeTakeFirstOrThrow();
	}
};
// src/database/models/source-state.ts
/**
* 渠道读到哪了：每个需要增量读取的目标一行。
*
* 主键是 `(channelId, name)`，所以不套 `Model` —— 它的按主键操作
* 只接受单个值，用在这里会误删同渠道的其它游标。
*/
var SourceState = class {
	db;
	constructor(db) {
		this.db = db;
	}
	/** 读一个游标；没读过时为空。 */
	async find(channelId, name) {
		return this.db.selectFrom("source_state").selectAll().where("channelId", "=", channelId).where("name", "=", name).executeTakeFirst();
	}
	/** 某渠道的全部游标。 */
	async listByChannel(channelId) {
		return this.db.selectFrom("source_state").selectAll().where("channelId", "=", channelId).orderBy("name").execute();
	}
	/** 推进游标；不存在则插入。 */
	async set(channelId, name, value, updatedAt) {
		await this.db.insertInto("source_state").values({
			channelId,
			name,
			value,
			updatedAt
		}).onConflict((oc) => oc.columns(["channelId", "name"]).doUpdateSet({
			value,
			updatedAt
		})).execute();
	}
	/** 删一个游标，例如话题已不再会被读取。 */
	async remove(channelId, name) {
		await this.db.deleteFrom("source_state").where("channelId", "=", channelId).where("name", "=", name).execute();
	}
};
// src/database/models/supervisor.ts
var Supervisor = class extends Model {
	constructor(db) {
		super(db, "supervisor", "id");
	}
	async listActive() {
		return this.db.selectFrom("supervisor").selectAll().where("status", "=", "active").orderBy("createdAt").execute();
	}
	async listByStatus(status) {
		return this.db.selectFrom("supervisor").selectAll().where("status", "=", status).orderBy("createdAt").execute();
	}
	async attachSession(id, sessionId) {
		await this.db.updateTable("supervisor").set({ sessionId }).where("id", "=", id).execute();
	}
	async close(id, closedAt) {
		await this.db.updateTable("supervisor").set({
			status: "closed",
			closedAt
		}).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("supervisor").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async findBySession(sessionId) {
		const rows = await this.db.selectFrom("supervisor").selectAll().where("sessionId", "=", sessionId).limit(2).execute();
		if (rows.length > 1) throw new Error("session_binding_conflict");
		return rows[0];
	}
};
// src/database/models/supervisor-ticket.ts
var SupervisorTicket = class {
	db;
	constructor(db) {
		this.db = db;
	}
	async listBySupervisor(supervisorId) {
		return this.db.selectFrom("supervisor_ticket").selectAll().where("supervisorId", "=", supervisorId).orderBy("createdAt").execute();
	}
	async listByTicket(ticketId) {
		return this.db.selectFrom("supervisor_ticket").selectAll().where("ticketId", "=", ticketId).execute();
	}
	async link(supervisorId, ticketId, createdAt) {
		await this.db.insertInto("supervisor_ticket").values({
			supervisorId,
			ticketId,
			createdAt
		}).onConflict((oc) => oc.columns(["supervisorId", "ticketId"]).doNothing()).execute();
	}
	async unlink(supervisorId, ticketId) {
		await this.db.deleteFrom("supervisor_ticket").where("supervisorId", "=", supervisorId).where("ticketId", "=", ticketId).execute();
	}
	async listAll() {
		return this.db.selectFrom("supervisor_ticket").selectAll().orderBy("createdAt").execute();
	}
};
// src/database/models/thread.ts
var Thread = class extends Model {
	constructor(db) {
		super(db, "thread", "id");
	}
	async findByRef(channelId, refId) {
		return this.db.selectFrom("thread").selectAll().where("channelId", "=", channelId).where("refId", "=", refId).executeTakeFirst();
	}
	async listRecent(limit = 50) {
		return this.db.selectFrom("thread").selectAll().orderBy("updatedAt", "desc").limit(limit).execute();
	}
	async touch(id, updatedAt) {
		await this.db.updateTable("thread").set({ updatedAt }).where("id", "=", id).execute();
	}
	async claim(id, projectId, triagedAt) {
		await this.db.updateTable("thread").set({
			projectId,
			triage: "claimed",
			triagedAt
		}).where("id", "=", id).execute();
	}
	async ignore(id, triagedAt) {
		await this.db.updateTable("thread").set({
			triage: "ignored",
			triagedAt
		}).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("thread").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async record(value) {
		await this.db.insertInto("thread").values(value).onConflict((oc) => oc.column("id").doUpdateSet({
			title: value.title,
			url: value.url,
			updatedAt: value.updatedAt
		})).execute();
		return await this.findById(value.id);
	}
	async listByChannel(channelId) {
		return this.db.selectFrom("thread").selectAll().where("channelId", "=", channelId).orderBy("id").execute();
	}
};
// src/database/models/ticket.ts
const CLOSED_STATUS = ["done", "cancelled"];
var Ticket = class Ticket extends Model {
	constructor(db) {
		super(db, "ticket", "id");
	}
	async listByProject(projectId, status) {
		const query = this.db.selectFrom("ticket").selectAll().where("projectId", "=", projectId);
		return (status ? query.where("status", "=", status) : query).orderBy("updatedAt", "desc").execute();
	}
	async listOpen() {
		return this.db.selectFrom("ticket").selectAll().where("status", "not in", [...CLOSED_STATUS]).orderBy("updatedAt", "desc").execute();
	}
	async countRunning() {
		const row = await this.db.selectFrom("ticket").select(this.db.fn.countAll().as("count")).where("status", "=", "running").executeTakeFirst();
		return Number(row?.count ?? 0);
	}
	async listDispatchable() {
		return this.db.selectFrom("ticket").selectAll().where("status", "in", ["waiting", "queued"]).where("paused", "=", 0).orderBy("createdAt").execute();
	}
	async start(id, startedAt, updatedAt) {
		await this.db.updateTable("ticket").set({
			status: "running",
			startedAt,
			updatedAt
		}).where("id", "=", id).execute();
	}
	async finish(id, status, endedAt, updatedAt) {
		await this.db.updateTable("ticket").set({
			status,
			endedAt,
			updatedAt
		}).where("id", "=", id).execute();
	}
	async setPullRequest(id, prUrl, prState, ciState) {
		await this.db.updateTable("ticket").set({
			prUrl,
			prState,
			ciState
		}).where("id", "=", id).execute();
	}
	async setPaused(id, paused, updatedAt) {
		await this.db.updateTable("ticket").set({
			paused: paused ? 1 : 0,
			updatedAt
		}).where("id", "=", id).execute();
	}
	async setPrepareError(id, prepareError, updatedAt) {
		await this.db.updateTable("ticket").set({
			prepareError,
			updatedAt
		}).where("id", "=", id).execute();
	}
	async save(id, patch) {
		await this.db.updateTable("ticket").set(patch).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("ticket").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listRecent(limit = 100) {
		return this.db.selectFrom("ticket").selectAll().orderBy("createdAt", "desc").orderBy("id").limit(Math.max(1, Math.min(1e3, limit))).execute();
	}
	async listFiltered(filters = {}) {
		let query = this.db.selectFrom("ticket").selectAll("ticket").select((eb) => eb.exists(eb.selectFrom("inbox").select("id").whereRef("inbox.ticketId", "=", "ticket.id").where("kind", "=", "ask").where("inbox.status", "=", "pending")).as("attention"));
		if (filters.projectId) query = query.where("ticket.projectId", "=", filters.projectId);
		if (filters.status) query = query.where("ticket.status", "=", filters.status);
		else query = query.where("ticket.status", "not in", ["done", "cancelled"]);
		if (filters.attentionOnly) query = query.where((eb) => eb.exists(eb.selectFrom("inbox").select("id").whereRef("inbox.ticketId", "=", "ticket.id").where("kind", "=", "ask").where("inbox.status", "=", "pending")));
		if (filters.supervisorId) query = query.where((eb) => eb.exists(eb.selectFrom("supervisor_ticket").select("ticketId").whereRef("supervisor_ticket.ticketId", "=", "ticket.id").where("supervisorId", "=", filters.supervisorId)));
		return query.orderBy("ticket.createdAt").orderBy("ticket.id").execute();
	}
	async createWithThreads(projectId, title, threadIds, description) {
		if (!threadIds.length) throw new Error("至少需要一条来源话题");
		return this.db.transaction().execute(async (trx) => {
			if (!await trx.selectFrom("project").selectAll().where("id", "=", projectId).executeTakeFirst()) throw new Error("项目不存在");
			const ids = [...new Set(threadIds)];
			const threads = await trx.selectFrom("thread").selectAll().where("id", "in", ids).execute();
			if (threads.length !== ids.length) throw new Error("来源话题不存在");
			const duplicate = await trx.selectFrom("ticket_thread").select("ticketId").where("threadId", "in", ids).executeTakeFirst();
			if (duplicate) throw new Error(`来源话题已关联工单：${duplicate.ticketId}`);
			const now = (/* @__PURE__ */ new Date()).toISOString();
			const id = `T-${randomUUID()}`;
			const row = {
				id,
				projectId,
				channelId: threads.find((row) => row.id === ids[0]).channelId,
				title,
				description: description ?? null,
				status: "waiting",
				createdAt: now,
				updatedAt: now,
				startedAt: null,
				endedAt: null,
				prUrl: null,
				prState: null,
				ciState: null,
				prepareError: null
			};
			await trx.insertInto("ticket").values(row).execute();
			for (const [index, threadId] of ids.entries()) await trx.insertInto("ticket_thread").values({
				ticketId: id,
				threadId,
				createdAt: new Date(Date.parse(now) + index).toISOString()
			}).execute();
			return await new Ticket(trx).findById(id);
		});
	}
	async requireOpen(id, projectId) {
		const row = await this.findById(id);
		if (!row || projectId !== void 0 && row.projectId !== projectId) throw new Error("工单不存在或不属于当前项目");
		if (row.status === "done" || row.status === "cancelled") throw new Error("工单已结束");
		return row;
	}
	async setPausedIfOpen(id, paused, updatedAt) {
		return this.db.updateTable("ticket").set({
			paused: paused ? 1 : 0,
			updatedAt
		}).where("id", "=", id).where("status", "not in", ["done", "cancelled"]).returningAll().executeTakeFirst();
	}
};
// src/database/models/ticket-link.ts
var TicketLink = class {
	db;
	constructor(db) {
		this.db = db;
	}
	async listByTicket(ticketId) {
		return this.db.selectFrom("ticket_link").selectAll().where("ticketId", "=", ticketId).orderBy("kind").orderBy("relatedId").execute();
	}
	async listByRelated(relatedId) {
		return this.db.selectFrom("ticket_link").selectAll().where("relatedId", "=", relatedId).orderBy("kind").orderBy("ticketId").execute();
	}
	async listDependsOn(ticketId) {
		return this.db.selectFrom("ticket_link").selectAll().where("ticketId", "=", ticketId).where("kind", "=", "depends").execute();
	}
	async link(ticketId, relatedId, kind, createdAt) {
		await this.db.insertInto("ticket_link").values({
			ticketId,
			relatedId,
			kind,
			createdAt
		}).onConflict((oc) => oc.columns([
			"ticketId",
			"relatedId",
			"kind"
		]).doNothing()).execute();
	}
	async unlink(ticketId, relatedId, kind) {
		await this.db.deleteFrom("ticket_link").where("ticketId", "=", ticketId).where("relatedId", "=", relatedId).where("kind", "=", kind).execute();
	}
	async listAll() {
		return this.db.selectFrom("ticket_link").selectAll().orderBy("createdAt").execute();
	}
};
// src/database/models/ticket-thread.ts
var TicketThread = class {
	db;
	constructor(db) {
		this.db = db;
	}
	async listByTicket(ticketId) {
		return this.db.selectFrom("ticket_thread").selectAll().where("ticketId", "=", ticketId).orderBy("createdAt").execute();
	}
	async listByThread(threadId) {
		return this.db.selectFrom("ticket_thread").selectAll().where("threadId", "=", threadId).orderBy("createdAt").execute();
	}
	async listTicketIds(threadId) {
		return (await this.db.selectFrom("ticket_thread").select("ticketId").where("threadId", "=", threadId).orderBy("createdAt").execute()).map((row) => row.ticketId);
	}
	async link(ticketId, threadId, createdAt) {
		const result = await this.db.insertInto("ticket_thread").values({
			ticketId,
			threadId,
			createdAt
		}).onConflict((oc) => oc.columns(["ticketId", "threadId"]).doNothing()).executeTakeFirst();
		return Number(result.numInsertedOrUpdatedRows) > 0;
	}
	async unlink(ticketId, threadId) {
		await this.db.deleteFrom("ticket_thread").where("ticketId", "=", ticketId).where("threadId", "=", threadId).execute();
	}
	async listAll() {
		return this.db.selectFrom("ticket_thread").selectAll().orderBy("createdAt").execute();
	}
};
// src/database/models/trigger.ts
var Trigger = class extends Model {
	constructor(db) {
		super(db, "trigger", "id");
	}
	async listByThread(threadId, limit = 50) {
		return this.db.selectFrom("trigger").selectAll().where("threadId", "=", threadId).orderBy("at", "desc").orderBy("id", "desc").limit(limit).execute();
	}
	async lastByThread(threadId) {
		return this.db.selectFrom("trigger").selectAll().where("threadId", "=", threadId).orderBy("at", "desc").orderBy("id", "desc").executeTakeFirst();
	}
	async listByChannelSince(channelId, since) {
		return this.db.selectFrom("trigger").selectAll().where("channelId", "=", channelId).where("at", ">", since).orderBy("at").execute();
	}
	async listByRef(channelId, ref) {
		return this.db.selectFrom("trigger").selectAll().where("channelId", "=", channelId).where("ref", "=", ref).orderBy("at", "desc").execute();
	}
	async exists(id) {
		return await this.db.selectFrom("trigger").select("id").where("id", "=", id).executeTakeFirst() !== void 0;
	}
	async findById(id) {
		return this.db.selectFrom("trigger").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listRecent(limit = 100) {
		return this.db.selectFrom("trigger").selectAll().orderBy("at", "desc").orderBy("id").limit(Math.max(1, Math.min(1e3, limit))).execute();
	}
	async ingest(value) {
		await this.db.insertInto("trigger").values(value).onConflict((oc) => oc.column("id").doNothing()).execute();
		return await this.findById(value.id);
	}
};
// src/database/models/worker.ts
var Worker = class Worker extends Model {
	constructor(db) {
		super(db, "worker", "id");
	}
	async listByTicket(ticketId) {
		return this.db.selectFrom("worker").selectAll().where("ticketId", "=", ticketId).orderBy("createdAt").execute();
	}
	async listRunning() {
		return this.db.selectFrom("worker").selectAll().where("status", "=", "running").orderBy("startedAt").execute();
	}
	async findRunningByBranch(branch) {
		return this.db.selectFrom("worker").selectAll().where("branch", "=", branch).where("status", "=", "running").executeTakeFirst();
	}
	async start(id, startedAt) {
		await this.db.updateTable("worker").set({
			status: "running",
			startedAt
		}).where("id", "=", id).execute();
	}
	async end(id, endedReason, endedAt) {
		await this.db.updateTable("worker").set({
			status: "ended",
			endedReason,
			endedAt
		}).where("id", "=", id).execute();
	}
	async setReport(id, reportState, report, reportAt) {
		await this.db.updateTable("worker").set({
			reportState,
			report,
			reportAt
		}).where("id", "=", id).execute();
	}
	async setBackgroundUntil(id, backgroundUntil) {
		await this.db.updateTable("worker").set({ backgroundUntil }).where("id", "=", id).execute();
	}
	async setRecoveryNote(id, recoveryNote) {
		await this.db.updateTable("worker").set({ recoveryNote }).where("id", "=", id).execute();
	}
	async findById(id) {
		return this.db.selectFrom("worker").selectAll().where("id", "=", id).executeTakeFirst();
	}
	async listRecent(limit = 100) {
		return this.db.selectFrom("worker").selectAll().orderBy("createdAt", "desc").orderBy("id").limit(Math.max(1, Math.min(1e3, limit))).execute();
	}
	async listQueued() {
		return this.db.selectFrom("worker").selectAll().where("status", "=", "queued").orderBy("createdAt").execute();
	}
	async queue(ticketId, projectId, branch) {
		if (branch && branch.split("/").at(-1) !== ticketId) throw new Error("分支末段必须是任务号");
		return this.db.transaction().execute(async (trx) => {
			const ticket = await trx.selectFrom("ticket").selectAll().where("id", "=", ticketId).where("projectId", "=", projectId).executeTakeFirst();
			if (!ticket || ticket.status === "done" || ticket.status === "cancelled") throw new Error("工单不存在、已结束或不属于当前项目");
			if (ticket.paused) throw new Error("工单已暂停");
			if (!(await trx.selectFrom("project").selectAll().where("id", "=", projectId).executeTakeFirst())?.enabled) throw new Error("项目未启用");
			const existing = await trx.selectFrom("worker").selectAll().where("ticketId", "=", ticketId).where("status", "!=", "ended").executeTakeFirst();
			if (existing) return existing;
			const id = randomUUID();
			const now = (/* @__PURE__ */ new Date()).toISOString();
			await trx.insertInto("worker").values({
				id,
				ticketId,
				status: "queued",
				createdAt: now,
				startedAt: null,
				endedAt: null,
				title: ticket.title,
				endedReason: null,
				branch: branch ?? `nexus/${ticketId}`,
				worktree: null,
				reportState: null,
				report: null,
				reportAt: null,
				backgroundUntil: null,
				recoveryNote: null
			}).execute();
			await trx.updateTable("ticket").set({
				status: "queued",
				updatedAt: now
			}).where("id", "=", ticketId).execute();
			return await new Worker(trx).findById(id);
		});
	}
	async reportProgress(id, reportState, report) {
		return this.db.transaction().execute(async (trx) => {
			const worker = await new Worker(trx).findById(id);
			if (!worker || worker.status === "ended") throw new Error("Worker 已结束或不存在");
			const ticket = await trx.selectFrom("ticket").selectAll().where("id", "=", worker.ticketId).executeTakeFirst();
			if (!ticket || ticket.status === "done" || ticket.status === "cancelled") throw new Error("工单已结束或不存在");
			const now = (/* @__PURE__ */ new Date()).toISOString();
			await new Worker(trx).setReport(id, reportState, report, now);
			return new Inbox(trx).enqueue({
				type: "project",
				projectId: ticket.projectId,
				origin: "worker",
				kind: "ticket",
				ticketId: ticket.id,
				workerId: id,
				title: reportState,
				message: report
			});
		});
	}
};
// src/database/utils/migration.ts
/**
* 把 SQL 文本包成 Kysely 迁移。
*
* 两个坑都在这里绕开：
* 1. Kysely 的 SQLite 适配器用 `prepare()` 执行，多语句**不报错、只跑第一条**，
*    所以改用 `DatabaseSync.exec()`，让 SQLite 自己解析整段脚本。
* 2. 适配器的 `supportsTransactionalDdl` 为 false，迁移不会被自动包进事务，
*    所以这里手动 BEGIN/COMMIT，一个迁移文件要么整篇生效、要么整篇回滚。
*
* 没有用 `kysely-migrate-sql`：它 0.2.0 从 `kysely` 根导入 `Migrator`，
* 而 Kysely 0.29 起该导出只在 `kysely/migration`，模块加载即抛
* `SyntaxError: does not provide an export named 'Migrator'`。
*/
var MigrationProvider = class {
	database;
	migrations;
	/**
	* @param database - 执行迁移的连接；必须与实际使用的同一个实例。
	* @param migrations - 迁移名到 SQL 全文的映射，按名字排序执行。
	*/
	constructor(database, migrations) {
		this.database = database;
		this.migrations = migrations;
	}
	async getMigrations() {
		return Object.fromEntries(Object.entries(this.migrations).map(([name, sql]) => [name, { up: async () => {
			const foreignKeys = this.database.prepare("PRAGMA foreign_keys").get()?.foreign_keys;
			this.database.exec("PRAGMA foreign_keys=OFF");
			this.database.exec("BEGIN");
			try {
				this.database.exec(sql);
				if (this.database.prepare("PRAGMA foreign_key_check").all().length) throw new Error(`Migration violates foreign key constraints: ${name}`);
				this.database.exec("COMMIT");
			} catch (error) {
				this.database.exec("ROLLBACK");
				throw error;
			} finally {
				this.database.exec(foreignKeys ? "PRAGMA foreign_keys=ON" : "PRAGMA foreign_keys=OFF");
			}
		} }]));
	}
};
// src/database/index.ts
const database = new DatabaseSync("data.db");
const connection = new Kysely({ dialect: new NodeSqliteDialect({ database }) });
const db = Object.assign(connection, {
	channel: new Channel(connection),
	channelAccount: new ChannelAccount(connection),
	ciWatch: new CiWatch(connection),
	inbox: new Inbox(connection),
	project: new Project(connection),
	sourceState: new SourceState(connection),
	supervisor: new Supervisor(connection),
	supervisorTicket: new SupervisorTicket(connection),
	thread: new Thread(connection),
	ticket: new Ticket(connection),
	ticketLink: new TicketLink(connection),
	ticketThread: new TicketThread(connection),
	trigger: new Trigger(connection),
	worker: new Worker(connection)
});
const { error } = await new Migrator({
	db,
	provider: new MigrationProvider(database, migrations)
}).migrateToLatest();
if (error) throw error;
const DSH_PLUGIN_HOME = `${process.env.DSH_HOME ?? join(homedir(), ".dsh")}/.nexus`;
// src/storage/index.ts
const storage = createStorage({ driver: fs({
	atomic: true,
	base: `${DSH_PLUGIN_HOME}/storage.json`
}) });
// src/utils/service.ts
function defineService(service) {
	return service;
}
// src/service/setting.ts
const defaults = {
	maxWorkers: 10,
	backgroundLimitMinutes: 30,
	autoMerge: false,
	autoMergeMaxLines: 200,
	deliveryMaxAttempts: 3,
	deliveryRetryCeilingSeconds: 60,
	updatedAt: ""
};
const limits = {
	maxWorkers: [1, 16],
	backgroundLimitMinutes: [1, 1440],
	autoMergeMaxLines: [1, 1e4],
	deliveryMaxAttempts: [1, 20],
	deliveryRetryCeilingSeconds: [2, 3600]
};
let writing$1 = Promise.resolve();
const setting = defineService({
	async load() {
		const value = await storage.getItem("setting");
		if (value === null) return { ...defaults };
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_stored_settings");
		const { updatedAt, ...patch } = value;
		if (updatedAt !== void 0 && typeof updatedAt !== "string" || !valid(patch, true)) throw new Error("invalid_stored_settings");
		return {
			...defaults,
			...patch,
			...updatedAt === void 0 ? {} : { updatedAt }
		};
	},
	save(patch) {
		if (!valid(patch)) return Promise.reject(/* @__PURE__ */ new TypeError("invalid_config"));
		const updates = { ...patch };
		const operation = writing$1.then(async () => {
			const next = {
				...await setting.load(),
				...updates,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
			await storage.setItem("setting", next);
			return next;
		});
		writing$1 = operation.then(() => void 0, () => void 0);
		return operation;
	}
});
function valid(value, allowEmpty = false) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const entries = Object.entries(value);
	if (!allowEmpty && entries.length === 0) return false;
	return entries.every(([key, entry]) => {
		if (key === "autoMerge") return typeof entry === "boolean";
		if (!Object.hasOwn(limits, key)) return false;
		const [min, max] = limits[key];
		return typeof entry === "number" && Number.isInteger(entry) && entry >= min && entry <= max;
	});
}
// src/channel/proxy.ts
async function channelProxyEnvironment(url, inherited) {
	const env = { ...inherited };
	const overlay = proxyEnvironmentForChild();
	const explicit = Object.entries(inherited).some(([name, value]) => /^(?:https?|all)_proxy$/i.test(name) && Boolean(value?.trim()));
	for (const [name, value] of Object.entries(overlay)) if (value === void 0) delete env[name];
	else env[name] = value;
	if (process.platform !== "win32" || explicit || Object.keys(overlay).length) return env;
	const settings = await new Promise((resolve) => {
		execFile("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], {
			windowsHide: true,
			timeout: 3e3,
			maxBuffer: 65536
		}, (error, stdout) => resolve(error ? "" : stdout));
	});
	if (!/^\s*ProxyEnable\s+REG_DWORD\s+0x0*1\s*$/im.test(settings)) return env;
	if ((/^\s*ProxyOverride\s+REG_SZ\s+(\S.*)$/im.exec(settings)?.[1].trim())?.split(";").some((pattern) => bypasses(url.hostname, pattern.trim()))) return env;
	const raw = /^\s*ProxyServer\s+REG_SZ\s+(\S.*)$/im.exec(settings)?.[1].trim();
	if (!raw) return env;
	const selected = raw.includes("=") ? raw.split(";").map((part) => part.trim()).find((part) => part.toLowerCase().startsWith(`${url.protocol.slice(0, -1)}=`))?.slice(url.protocol.length) : raw;
	if (!selected) return env;
	try {
		const proxy = new URL(selected.includes("://") ? selected : `http://${selected}`);
		if (!["http:", "https:"].includes(proxy.protocol) || !proxy.hostname || proxy.pathname !== "/" || proxy.search || proxy.hash) return env;
		env.HTTP_PROXY = proxy.href;
		env.HTTPS_PROXY = proxy.href;
		delete env.http_proxy;
		delete env.https_proxy;
	} catch {}
	return env;
}
function bypasses(hostname, pattern) {
	if (!pattern) return false;
	if (pattern.toLowerCase() === "<local>") return !hostname.includes(".") && !hostname.includes(":");
	const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replaceAll("*", ".*");
	return new RegExp(`^${escaped}$`, "i").test(hostname);
}
// src/service/session.ts
const presets$1 = {
	main: "orchestrator",
	project: "manager",
	supervisor: "supervisor",
	worker: "worker"
};
const registered = /* @__PURE__ */ new Set();
const operations$3 = /* @__PURE__ */ new Map();
let controller$1 = new AbortController();
let stopped$3 = false;
const session = defineService({
	register(id) {
		registered.add(id);
		return () => {
			registered.delete(id);
		};
	},
	async attach(agent) {
		const ctx = getServerContext(server);
		const preset = ctx.agentPresets.composedPreset(agent.ctx);
		if (!preset || !registered.has(preset) || agent.session.header.origin === "subagent" || agent.session.header.parentSession || ctx.workspaceRegistry.archivedSessionIds.includes(agent.session.id)) return null;
		const role = Object.keys(presets$1).find((role) => presets$1[role] === preset);
		if (!role) return null;
		if (role === "main") {
			const current = await session.findMain();
			if (current && current !== agent.session.id) throw new Error("ambiguous_main_session");
			await storage.setItem("mainSessionId", agent.session.id);
		}
		return role;
	},
	start() {
		if (operations$3.size) throw new Error("session_busy");
		controller$1 = new AbortController();
		stopped$3 = false;
		return async () => {
			stopped$3 = true;
			controller$1.abort(/* @__PURE__ */ new Error("session_stopped"));
			await Promise.allSettled([...operations$3.values()]);
		};
	},
	async resolve(id) {
		const ctx = getServerContext(server);
		const sid = SessionId(id);
		if (ctx.workspaceRegistry.archivedSessionIds.includes(sid)) return null;
		let header;
		let preset;
		try {
			const snapshot = await ctx.sessionQuery.readSession(sid);
			header = snapshot.session;
			preset = ctx.agentPresets.presetForSession(Session.create(sid, snapshot.events, snapshot.session));
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "SESSION_QUERY_SESSION_NOT_FOUND") return null;
			throw error;
		}
		if (!preset || !registered.has(preset) || header.origin === "subagent" || header.parentSession) return null;
		const [worker, project, supervisor] = await Promise.all([
			db.worker.findById(id),
			db.project.findBySession(id),
			db.supervisor.findBySession(id)
		]);
		if ([
			worker,
			project,
			supervisor
		].filter(Boolean).length > 1) throw new Error("session_binding_conflict");
		if (worker) {
			const agent = ctx.agents.get(sid);
			if (preset !== presets$1.worker || !agent || ctx.agentPresets.composedPreset(agent.ctx) !== presets$1.worker) return null;
			const ticket = await db.ticket.findById(worker.ticketId);
			return ticket ? {
				role: "worker",
				projectId: ticket.projectId,
				ticketId: ticket.id,
				workerId: worker.id
			} : null;
		}
		if (project) return preset === presets$1.project ? {
			role: "project",
			projectId: project.id
		} : null;
		if (supervisor) return preset === presets$1.supervisor && supervisor.status === "active" ? {
			role: "supervisor",
			supervisorId: supervisor.id
		} : null;
		return preset === presets$1.main && await storage.getItem("mainSessionId") === id ? { role: "main" } : null;
	},
	async findMain() {
		const id = await storage.getItem("mainSessionId");
		return id && (await session.resolve(id))?.role === "main" ? id : null;
	},
	async create(role, options) {
		if (stopped$3) throw new Error("runtime_stopping");
		return run$3(`session:create:${role}:${role === "worker" ? options.sessionId : role === "project" ? options.projectId : role === "supervisor" ? options.supervisorId : "main"}`, async () => {
			const ctx = getServerContext(server);
			const project = options.projectId ? await db.project.findById(options.projectId) : void 0;
			const supervisor = options.supervisorId ? await db.supervisor.findById(options.supervisorId) : void 0;
			if (role === "project" && !project) throw new Error("project_not_found");
			if (role === "supervisor" && (!supervisor || supervisor.status !== "active")) throw new Error("supervisor_not_active");
			if (role === "main") {
				const existing = await session.findMain();
				if (existing) return existing;
			}
			if (role === "project" && project?.orchestratorSessionId) {
				const identity = await session.resolve(project.orchestratorSessionId);
				if (identity?.role === "project" && identity.projectId === project.id) return project.orchestratorSessionId;
				if (identity) throw new Error("session_binding_conflict");
			}
			const requestedId = options.sessionId ?? randomUUID();
			if (role === "worker") {
				const worker = await db.worker.findById(requestedId);
				if (!worker || worker.ticketId !== options.ticketId || worker.status === "ended") throw new Error("worker_binding_required");
			}
			const directory = options.directory ?? project?.directory ?? join(DSH_PLUGIN_HOME, "sessions", requestedId);
			await mkdir(directory, { recursive: true });
			const id = (await ctx.sessionController.create({
				sessionId: SessionId(requestedId),
				cwd: directory,
				agentPreset: presets$1[role]
			})).sessionId;
			if (id !== requestedId) throw new Error("session_identity_conflict");
			if (role === "main") await storage.setItem("mainSessionId", id);
			if (project && role === "project") await db.project.setOrchestrator(project.id, id, (/* @__PURE__ */ new Date()).toISOString());
			if (supervisor && role === "supervisor") await db.supervisor.attachSession(supervisor.id, id);
			if (options.title) await ctx.sessionController.rename({
				sessionId: id,
				title: options.title
			});
			if (role !== "worker") await inbox.notify(await resolveAgent(id), true);
			if (options.prompt) await session.send(id, options.prompt);
			return id;
		});
	},
	async send(id, text, mode = "queue", requestId = randomUUID()) {
		if (!text.trim()) throw new Error("empty_message");
		if (stopped$3) throw new Error("runtime_stopping");
		return run$3(`session:send:${id}:${requestId}`, async () => {
			const identity = await session.resolve(id);
			if (!identity) {
				const worker = await db.worker.findById(id);
				throw new Error(worker ? worker.status === "ended" ? "worker_ended" : "worker_not_live_or_archived" : "unknown_session");
			}
			if (identity.workerId && (await db.worker.findById(id))?.status === "ended") throw new Error("worker_ended");
			const ctx = getServerContext(server);
			if (mode === "interrupt") await session.cancel(id, true);
			await ctx.sessionController.prompt({
				sessionId: SessionId(id),
				requestId,
				mode: identity.role !== "worker" && mode === "queue" ? "queue" : "steer",
				content: [{
					type: "text",
					text
				}]
			}, controller$1.signal);
		});
	},
	async cancel(id, keepInbox = false) {
		(await resolveAgent(id)).cancel({
			kind: "hook",
			reason: "nexus_cancel"
		}, { keepInbox });
	},
	async rename(id, title) {
		if (!await session.resolve(id)) throw new Error("unknown_session");
		await getServerContext(server).sessionController.rename({
			sessionId: SessionId(id),
			title
		});
	},
	async view(id, offset = 0, limit = 12e3) {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 5e4) throw new Error("invalid_page");
		if (!await session.resolve(id)) throw new Error("unknown_session");
		const { events } = await getServerContext(server).sessionQuery.readSession(SessionId(id));
		const text = events.flatMap((event) => {
			if (event.type !== "user/message" && event.type !== "assistant/message") return [];
			return (event.type === "assistant/message" ? event.data.message : event.data).content.flatMap((part) => part.type === "text" ? [part.text] : []);
		}).join(String.fromCharCode(10, 10));
		const end = Math.min(text.length, offset + limit);
		return {
			text: text.slice(offset, end),
			next_offset: end < text.length ? end : null
		};
	},
	async lookup(id) {
		if (!await session.resolve(id)) return null;
		return getServerContext(server).agents.get(SessionId(id)) ?? null;
	},
	async history(id) {
		return getServerContext(server).sessionQuery.readSession(SessionId(id));
	},
	async receipts(id) {
		const { events } = await getServerContext(server).sessionQuery.readSession(SessionId(id));
		const receipts = [];
		let pending = [];
		for (const event of events) {
			if (event.type === "turn/start") pending = [];
			if (event.type === "user/message" && "rpcId" in event.data.source && typeof event.data.source.rpcId === "string") pending.push(event.data.source.rpcId);
			if (event.type === "turn/end" && event.data.reason.kind === "completed") {
				receipts.push(...pending.map((requestId) => ({
					requestId,
					consumedAt: new Date(event.time).toISOString()
				})));
				pending = [];
			}
		}
		return receipts;
	},
	async activity(id) {
		const ctx = getServerContext(server);
		const activities = await ctx.waterfall("workspace/session-activity", { sessionId: SessionId(id) }, () => Promise.resolve([]));
		const state = await ctx.sessionController.state({ sessionId: SessionId(id) }, controller$1.signal);
		return {
			running: state.running,
			background: activities.some((item) => String(item.kind) !== "turn"),
			queued: Boolean(state.queue?.length)
		};
	},
	async stop(id) {
		const ctx = getServerContext(server);
		await ctx.parallel("workspace/session-stop", { sessionId: SessionId(id) });
		const result = await ctx.sessionController.resolveAgent(SessionId(id));
		if ("agent" in result) {
			result.agent.cancel({
				kind: "hook",
				reason: "nexus_stop"
			}, { keepInbox: true });
			await result.agent.whenIdle();
		}
		if ((await session.activity(id)).background) throw new Error("background_stop_pending");
	}
});
async function resolveAgent(id) {
	if (!await session.resolve(id)) throw new Error("unknown_session");
	const result = await getServerContext(server).sessionController.resolveAgent(SessionId(id));
	if ("error" in result) throw result.error;
	return result.agent;
}
function run$3(key, action) {
	if (stopped$3) return Promise.reject(/* @__PURE__ */ new Error("runtime_stopping"));
	const current = operations$3.get(key);
	if (current) return current;
	const task = Promise.resolve().then(action).finally(() => operations$3.delete(key));
	operations$3.set(key, task);
	return task;
}
// src/service/inbox.ts
const operations$2 = /* @__PURE__ */ new Map();
const deliveredAnswers = /* @__PURE__ */ new Set();
let stopped$2 = false;
const inbox = defineService({
	async notify(agent, restore = false) {
		return run$2(`notify:${agent.session.id}`, async () => {
			if (agent.status !== "idle" && !restore) return;
			const mailbox = await inbox.peek(agent.session.id);
			if (!mailbox) return;
			const revision = mailbox.messages.map((message) => [message.id, message.escalations]).sort().map((parts) => parts.join(":")).join("|");
			if (!revision && !restore) return;
			const { events } = await session.history(agent.session.id);
			if ([...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((message) => message.source.kind === (restore ? "nexus-mailbox-context" : "nexus-mailbox") && message.source.revision === revision)) return;
			if (events.some((event) => event.type === "user/message" && event.data.source.kind === (restore ? "nexus-mailbox-context" : "nexus-mailbox") && event.data.source.revision === revision)) return;
			const text = `你有${mailbox.pendingCount}个未读邮件，请及时处理。`;
			const message = createUserMessage({
				content: [{
					type: "text",
					text
				}],
				source: {
					kind: restore ? "nexus-mailbox-context" : "nexus-mailbox",
					form: "notice",
					summary: text,
					revision
				}
			});
			if (stopped$2 || !await session.resolve(agent.session.id)) return;
			if (restore) agent.inject(message);
			else if (agent.status === "idle") agent.followup(message);
		});
	},
	async peek(id, includeChannel = false) {
		const identity = await session.resolve(id);
		if (!identity) return null;
		const scope = scopeOf(identity);
		if (!scope) return null;
		const messages = await db.inbox.listScoped(scope, includeChannel);
		return {
			sessionId: id,
			role: scope.type,
			pendingCount: messages.length,
			messages
		};
	},
	async read(id, includeChannel = false) {
		const mailbox = await inbox.peek(id, includeChannel);
		if (!mailbox) throw new Error("unknown_session");
		const now = (/* @__PURE__ */ new Date()).toISOString();
		await db.inbox.markRead(mailbox.messages.filter((message) => !message.readAt).map((message) => message.id), now);
		return mailbox;
	},
	async complete(id, ids, includeChannel = false) {
		const identity = await session.resolve(id);
		if (!identity) throw new Error("unknown_session");
		const scope = scopeOf(identity);
		if (!scope) throw new Error("unknown_session");
		return db.inbox.completeScoped(ids, scope, (/* @__PURE__ */ new Date()).toISOString(), includeChannel);
	},
	start() {
		if (operations$2.size) throw new Error("inbox_busy");
		stopped$2 = false;
		deliveredAnswers.clear();
		return async () => {
			stopped$2 = true;
			await Promise.allSettled([...operations$2.values()]);
			deliveredAnswers.clear();
		};
	},
	deliver() {
		return run$2("delivery", async () => {
			const settings = await setting.load();
			const blocked = /* @__PURE__ */ new Set();
			const receipts = /* @__PURE__ */ new Map();
			for (const message of await db.inbox.listDelivery()) {
				if (stopped$2) break;
				const key = [
					message.type,
					message.projectId,
					message.supervisorId,
					message.ticketId
				].join(":");
				if (message.origin !== "channel") {
					if (!blocked.has(key)) {
						blocked.add(key);
						const id = await recipient(message, false);
						const agent = id ? await session.lookup(id) : null;
						if (agent?.status === "idle") await inbox.notify(agent);
					}
					continue;
				}
				if (blocked.has(key) || message.readAt) continue;
				blocked.add(key);
				if (message.status === "stalled" || message.nextRetryAt && message.nextRetryAt > (/* @__PURE__ */ new Date()).toISOString()) continue;
				if (message.ticketId && (await db.ticket.findById(message.ticketId))?.paused) continue;
				if (message.type === "project" && message.projectId && !(await db.project.findById(message.projectId))?.enabled) continue;
				try {
					const id = await recipient(message);
					if (!id) throw new Error("recipient_session_unavailable");
					let consumed = receipts.get(id);
					if (!consumed) {
						consumed = await session.receipts(id);
						receipts.set(id, consumed);
					}
					const requestId = `nexus:inbox:${message.id}:${message.escalations}`;
					const receipt = consumed.find((item) => item.requestId === requestId);
					if (receipt) {
						await db.inbox.markRead([message.id], receipt.consumedAt);
						blocked.delete(key);
						continue;
					}
					if ((await session.activity(id)).running || stopped$2) continue;
					await session.send(id, [message.title ?? "", `[Inbox ${message.id}] ${message.message}`].filter(Boolean).join(String.fromCharCode(10)), "queue", requestId);
					await db.inbox.resetDelivery(message.id);
					blocked.delete(key);
				} catch (error) {
					if (stopped$2) break;
					const reason = error instanceof Error ? error.message : String(error);
					const attempts = message.deliveryAttempts + 1;
					const delay = Math.min(2 ** Math.min(attempts, 20), settings.deliveryRetryCeilingSeconds) * 1e3;
					await db.inbox.recordDeliveryFailure(message.id, reason, new Date(Date.now() + delay).toISOString());
					if (attempts >= settings.deliveryMaxAttempts) await db.inbox.markStalled(message.id, reason);
				}
			}
		});
	},
	deliverAnswers() {
		return run$2("answers", async () => {
			for (const message of await db.inbox.listAnswered()) {
				if (stopped$2) break;
				if (!message.answer || message.nextRetryAt && message.nextRetryAt > (/* @__PURE__ */ new Date()).toISOString()) continue;
				try {
					if (message.answeredBy !== "user" && message.origin !== "worker") {
						await db.inbox.enqueueAnswer(message);
						continue;
					}
					let id = null;
					if (message.origin === "worker") {
						const worker = message.workerId ? await db.worker.findById(message.workerId) : void 0;
						if (!worker) throw new Error("worker_not_found");
						if (worker.status === "ended") throw new Error("worker_ended");
						id = worker.id;
					} else if (message.origin === "project" && message.projectId) {
						const project = await db.project.findById(message.projectId);
						if (project?.enabled) id = project.orchestratorSessionId;
					} else if (message.origin === "supervisor" && message.supervisorId) {
						const supervisor = await db.supervisor.findById(message.supervisorId);
						if (supervisor?.status === "active") id = supervisor.sessionId;
					} else if (message.origin === "main") id = await session.findMain();
					if (!id || deliveredAnswers.has(`${message.id}:${id}`) || stopped$2) continue;
					if (message.ticketId && (await db.ticket.findById(message.ticketId))?.paused) continue;
					await session.send(id, `[Answer ${message.id}] ${message.answer}`, "reply", `nexus:answer:${message.id}`);
					deliveredAnswers.add(`${message.id}:${id}`);
					await db.inbox.resetDelivery(message.id);
				} catch (error) {
					if (stopped$2) break;
					await db.inbox.recordDeliveryFailure(message.id, error instanceof Error ? error.message : String(error), new Date(Date.now() + 2e3).toISOString());
				}
			}
		});
	}
});
function run$2(key, action) {
	if (stopped$2) return Promise.reject(/* @__PURE__ */ new Error("inbox_stopped"));
	const current = operations$2.get(key);
	if (current) return current;
	const task = Promise.resolve().then(action).finally(() => operations$2.delete(key));
	operations$2.set(key, task);
	return task;
}
async function recipient(message, create = true) {
	if (message.type === "main") return session.findMain();
	if (message.type === "project" && message.projectId) {
		const project = await db.project.findById(message.projectId);
		if (!project) throw new Error("project_not_found");
		return project.orchestratorSessionId ?? (create ? session.create("project", {
			projectId: project.id,
			directory: project.directory,
			title: project.name
		}) : null);
	}
	if (message.type === "supervisor" && message.supervisorId) {
		const supervisor = await db.supervisor.findById(message.supervisorId);
		if (!supervisor || supervisor.status !== "active") throw new Error("supervisor_not_active");
		return supervisor.sessionId ?? (create ? session.create("supervisor", {
			supervisorId: supervisor.id,
			title: supervisor.title
		}) : null);
	}
	throw new Error("invalid_inbox_recipient");
}
function scopeOf(identity) {
	if (identity.role === "main") return { type: "main" };
	if (identity.role === "project" && identity.projectId) return {
		type: "project",
		projectId: identity.projectId
	};
	if (identity.role === "supervisor" && identity.supervisorId) return {
		type: "supervisor",
		supervisorId: identity.supervisorId
	};
	return null;
}
// src/server/routes/ask.answers.post.ts
const postAnswer = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	const body = await readBody(event);
	if (!id?.trim() || !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "answer") || typeof body.answer !== "string" || !body.answer.trim()) throw new HTTPError({
		status: 400,
		message: "answer_required"
	});
	const current = await db.inbox.findById(id);
	if (!current) throw new HTTPError({
		status: 404,
		message: "not_found"
	});
	if (current.type !== "user" || current.kind !== "ask") throw new HTTPError({
		status: 403,
		message: "scope_denied"
	});
	if (![
		"worker",
		"project",
		"supervisor",
		"main"
	].includes(current.origin)) throw new HTTPError({
		status: 409,
		message: "unsupported_reply_target"
	});
	const answer = await db.inbox.answerByUser(id, body.answer.trim(), (/* @__PURE__ */ new Date()).toISOString());
	if (!answer) throw new HTTPError({
		status: 409,
		message: "already_answered"
	});
	await inbox.deliverAnswers();
	return answer;
});
// src/service/channel-auth.ts
const authentications = /* @__PURE__ */ new Map();
const active = /* @__PURE__ */ new Map();
const lifetime = 6e5;
const channelAuth = defineService({
	async start(channelId, host) {
		if (channelId !== "github" && channelId !== "gitlab") throw new TypeError("channel_unsupported");
		const origin = host !== void 0 ? site(channelId, host) : channelId === "github" ? "https://github.com" : void 0;
		const pending = active.get(channelId);
		if (pending) {
			if (origin && pending.origin && origin !== pending.origin) throw new Error("channel_auth_in_progress");
			return snapshot(pending);
		}
		prune();
		const task = {
			view: {
				id: randomUUID(),
				channelId,
				status: "pending",
				output: channelId === "github" ? "Waiting for GitHub authorization." : "Waiting for GitLab device authorization (GitLab 17.9+)."
			},
			origin,
			controller: new AbortController(),
			done: Promise.resolve()
		};
		const dispose = getServerContext(server).effect(() => () => cancel$1(task), "nexus:channel-auth");
		authentications.set(task.view.id, task);
		active.set(channelId, task);
		task.done = Promise.resolve().then(() => authenticate(task)).finally(() => {
			active.delete(channelId);
			task.finishedAt = Date.now();
		});
		task.done.then(() => dispose());
		return snapshot(task);
	},
	lookup(channelId, authenticationId) {
		prune();
		const task = authentications.get(authenticationId);
		return task?.view.channelId === channelId ? snapshot(task) : null;
	},
	async cancel(channelId) {
		if (channelId !== "github" && channelId !== "gitlab") throw new TypeError("channel_unsupported");
		const pending = active.get(channelId);
		if (pending) await cancel$1(pending);
	},
	async cleanup() {
		await Promise.all([...active.values()].map(cancel$1));
	}
});
function snapshot(task) {
	return {
		...task.view,
		...task.view.account ? { account: { ...task.view.account } } : {}
	};
}
function prune() {
	for (const [id, task] of authentications) if (task.finishedAt && (Date.now() - task.finishedAt > lifetime || authentications.size >= 32)) authentications.delete(id);
}
async function cancel$1(task) {
	if (!task.finishedAt) task.controller.abort();
	await task.done;
}
async function authenticate(task) {
	const directory = join(DSH_PLUGIN_HOME, `${task.view.channelId}-auth`, task.view.id);
	let env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key === "GITLAB_CLIENT_ID" || !/^(?:GH_|GITHUB_|GLAB_|GITLAB_|OAUTH_TOKEN$|CI_JOB_TOKEN$|GL_HOST$|BROWSER$|API_PROTOCOL$|SKIP_TLS_VERIFY$|NO_PROMPT$|PROMPT_DISABLED$)/i.test(key)));
	env.GH_CONFIG_DIR = directory;
	env.GLAB_CONFIG_DIR = directory;
	env.GH_HOST = "github.com";
	env.GH_BROWSER = `"${process.execPath.replaceAll("\\", "/")}" -e "process.exit(0)"`;
	env.ELECTRON_RUN_AS_NODE = "1";
	env.GLAB_BROWSER = env.GH_BROWSER;
	env.GLAB_CHECK_UPDATE = "false";
	env.GLAB_SKIP_TLS_VERIFY = "false";
	env.GLAB_API_PROTOCOL = "https";
	env.GH_PAGER = "cat";
	env.NO_COLOR = "1";
	const timeout = setTimeout(() => task.controller.abort(), lifetime);
	timeout.unref();
	try {
		task.controller.signal.throwIfAborted();
		await mkdir(directory, {
			recursive: true,
			mode: 448
		});
		if (!task.origin) task.origin = site(task.view.channelId, (await channel.list()).find((item) => item.id === task.view.channelId)?.host ?? "https://gitlab.com");
		env = await channelProxyEnvironment(new URL(task.origin), env);
		const hostname = new URL(task.origin).host;
		await command(task, task.view.channelId === "github" ? [
			"auth",
			"login",
			"--hostname",
			hostname,
			"--git-protocol",
			"https",
			"--web",
			"--insecure-storage"
		] : [
			"auth",
			"login",
			"--hostname",
			hostname,
			"--git-protocol",
			"https",
			"--api-protocol",
			"https",
			"--device",
			"--insecure-storage"
		], env, true);
		task.controller.signal.throwIfAborted();
		const token = (await command(task, task.view.channelId === "github" ? [
			"auth",
			"token",
			"--hostname",
			hostname
		] : [
			"config",
			"get",
			"token",
			"--host",
			hostname
		], env, false)).trim();
		if (!token || token.length > 8192 || /[\r\n]/.test(token)) throw new Error("channel_auth_token_failed");
		task.controller.signal.throwIfAborted();
		const account = (await channel.save(task.view.channelId, {
			token,
			...task.view.channelId === "gitlab" ? { host: task.origin } : {}
		})).accounts.find((account) => account.role === "bot");
		if (!account) throw new Error("channel_auth_verification_failed");
		task.view.account = { login: account.name };
		task.view.status = "succeeded";
	} catch (error) {
		task.view.status = "failed";
		const missing = error instanceof Error && error.code === "ENOENT";
		task.view.error = task.controller.signal.aborted ? "channel_auth_cancelled" : missing ? task.view.channelId === "github" ? "gh_missing" : "glab_missing" : task.networkTimeout ? "channel_auth_network_timeout" : "channel_auth_failed";
		publish(task.view, missing ? `Required CLI is not installed: ${task.view.channelId === "github" ? "gh" : "glab"}.` : task.controller.signal.aborted ? "Authentication cancelled." : task.networkTimeout ? `连接授权服务器超时，尚未完成登录。${env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy ? "CLI已继承代理配置（宿主或Windows已启用配置），请检查代理连通性及绕过规则。" : "CLI未收到HTTP(S)代理配置，当前使用直连；请检查宿主或Windows系统代理设置。"}终端可登录不代表宿主子进程使用相同网络路径。` : "Authentication failed. Review the CLI output above.");
	} finally {
		clearTimeout(timeout);
		try {
			await rm(directory, {
				recursive: true,
				force: true
			});
		} catch {
			if (task.view.status !== "succeeded") task.view.status = "failed";
			task.view.error = "channel_auth_cleanup_failed";
		}
	}
}
function command(task, args, env, login) {
	return new Promise((resolve, reject) => {
		task.controller.signal.throwIfAborted();
		const child = spawn(task.view.channelId === "github" ? "gh" : "glab", args, {
			env,
			cwd: env.GH_CONFIG_DIR,
			windowsHide: true,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			signal: task.controller.signal
		});
		let output = "";
		const stdout = lines(task);
		const stderr = lines(task);
		let failure;
		let force;
		const abort = () => {
			force = setTimeout(() => child.kill("SIGKILL"), 1e3);
			force.unref();
		};
		task.controller.signal.addEventListener("abort", abort, { once: true });
		child.on("error", (error) => {
			failure = error;
		});
		child.stdin.on("error", () => {});
		child.stdout.on("data", (chunk) => {
			if (login) stdout.write(chunk);
			else {
				output = (output + chunk.toString("utf8")).slice(0, 8193);
				if (output.length > 8192) {
					failure = /* @__PURE__ */ new Error("channel_auth_output_limit");
					task.controller.abort();
				}
			}
		});
		child.stderr.on("data", (chunk) => {
			if (login) stderr.write(chunk);
		});
		child.once("close", (code) => {
			clearTimeout(force);
			task.controller.signal.removeEventListener("abort", abort);
			if (login) {
				stdout.end();
				stderr.end();
			}
			if (failure || code !== 0 || task.controller.signal.aborted) {
				if (login && code !== 0 && !task.controller.signal.aborted && !failure) publish(task.view, `CLI exited with status ${code ?? "unknown"}.`);
				reject(failure ?? /* @__PURE__ */ new Error("channel_auth_process_failed"));
			} else resolve(output);
		});
		child.stdin.end(login ? "\n" : void 0);
	});
}
function authorize$1(task, raw) {
	const view = task.view;
	const text = stripVTControlCharacters(raw);
	const code = /(?:one[- ]time|device|user) code[:\s]+([A-Z0-9]{4}-[A-Z0-9]{4})\b/i.exec(text);
	if (code) view.userCode = code[1].toUpperCase();
	for (const match of text.matchAll(/https:\/\/[^\s'"<>]+/gi)) try {
		const url = new URL(match[0]);
		const allowed = view.channelId === "github" ? ["/login/device"] : ["/oauth/device", "/-/oauth/device"];
		if (url.origin === task.origin && !url.username && !url.password && !url.search && !url.hash && allowed.includes(url.pathname)) view.verificationUri = url.href;
	} catch {}
	publish(view, text);
}
function site(channelId, host) {
	try {
		const url = new URL(host);
		if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && (channelId !== "github" || url.origin === "https://github.com")) return url.origin;
	} catch {}
	throw new TypeError("invalid_channel_host");
}
function publish(view, line) {
	view.output = [view.output, line].filter(Boolean).join("\n").slice(-1024);
}
function lines(task) {
	const decoder = new StringDecoder("utf8");
	let pending = "";
	let discarded = false;
	const complete = () => {
		const text = [...stripVTControlCharacters(pending)].filter((char) => char.charCodeAt(0) >= 32 || char === "	").join("").trim();
		if (!discarded && /(?:dial tcp|connectex|connection|connect|i\/o|TLS handshake|request|context deadline).*(?:timed? out|timeout|deadline exceeded)|(?:timed? out|timeout).*(?:connect|request)/i.test(text)) task.networkTimeout = true;
		if (!discarded && text && !/token|password|authorization|secret|gh[pousr]_|github_pat_|glpat[-_]|Bearer\s|\b[\w=-]{40,}\b/i.test(text)) authorize$1(task, text.replace(/https?:\/\/[^\s'"<>]+/gi, (raw) => {
			try {
				const url = new URL(raw);
				const paths = task.view.channelId === "github" ? [
					"/login/device",
					"/login/device/code",
					"/login/oauth/access_token"
				] : [
					"/oauth/device",
					"/-/oauth/device",
					"/oauth/device/code",
					"/oauth/token"
				];
				if (url.origin === task.origin && !url.username && !url.password && paths.includes(url.pathname)) return `${url.origin}${url.pathname}`;
			} catch {}
			return "[URL omitted]";
		}));
		pending = "";
		discarded = false;
	};
	return {
		write(chunk) {
			const parts = decoder.write(chunk).split("\n");
			for (let index = 0; index < parts.length; index++) {
				if (!discarded) {
					if (pending.length + parts[index].length > 4096) {
						pending = "";
						discarded = true;
					} else pending += parts[index];
				}
				if (index < parts.length - 1) complete();
			}
		},
		end() {
			pending += decoder.end();
			complete();
		}
	};
}
// src/server/routes/channel.authentication.get.ts
const getChannelAuthentication = defineHandler((event) => {
	const id = getRouterParam(event, "id");
	const authenticationId = getRouterParam(event, "authenticationId");
	if (!id || !authenticationId) throw new HTTPError({
		status: 400,
		message: "invalid_authentication"
	});
	const authentication = channelAuth.lookup(id, authenticationId);
	if (!authentication) throw new HTTPError({
		status: 404,
		message: "channel_auth_not_found"
	});
	return authentication;
});
// src/server/routes/channel.authentication.post.ts
const postChannelAuthentication = defineHandler(async (event) => {
	const id = getRouterParam(event, "id");
	if (!id) throw new HTTPError({
		status: 400,
		message: "invalid_channel"
	});
	const body = await readBody(event);
	if (body !== void 0 && (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "host") || body.host !== void 0 && typeof body.host !== "string")) throw new HTTPError({
		status: 400,
		message: "invalid_authentication"
	});
	try {
		return await channelAuth.start(id, body?.host);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message === "channel_unsupported" || message === "invalid_channel_host") throw new HTTPError({
			status: 400,
			message
		});
		if (message === "channel_auth_in_progress") throw new HTTPError({
			status: 409,
			message
		});
		throw new HTTPError({
			status: 503,
			message: "channel_auth_unavailable"
		});
	}
});
// src/server/routes/channel.configuration.ts
const putChannelConfiguration = defineHandler(async (event) => {
	const id = getRouterParam(event, "id");
	const body = await readBody(event);
	if (!id || !body) throw new HTTPError({
		status: 400,
		message: "invalid_channel_config"
	});
	try {
		return { channel: await channel.save(id, body) };
	} catch (error) {
		const message = error instanceof Error && [
			"channel_unsupported",
			"invalid_channel_config",
			"invalid_channel_token",
			"invalid_commit_identity",
			"invalid_channel_host",
			"invalid_expected_account",
			"channel_identity_mismatch",
			"channel_account_required",
			"channel_auth_failed",
			"channel_verification_failed"
		].includes(error.message) ? error.message : "channel_save_failed";
		throw new HTTPError({
			status: error instanceof TypeError ? 400 : message === "channel_auth_failed" ? 422 : 502,
			message
		});
	}
});
// src/server/routes/channel.credentials.delete.ts
const deleteChannelCredentials = defineHandler(async (event) => {
	const id = getRouterParam(event, "id");
	if (!id) throw new HTTPError({
		status: 400,
		message: "channel_unsupported"
	});
	try {
		await channelAuth.cancel(id);
		return { channel: await channel.removeCredentials(id) };
	} catch (error) {
		const unsupported = error instanceof TypeError && error.message === "channel_unsupported";
		throw new HTTPError({
			status: unsupported ? 400 : 502,
			message: unsupported ? "channel_unsupported" : "channel_credentials_delete_failed"
		});
	}
});
// src/service/worktree.ts
const execute = promisify(execFile);
const operations$1 = /* @__PURE__ */ new Map();
let controller = new AbortController();
let stopped$1 = false;
const worktree = defineService({
	start() {
		if (operations$1.size) throw new Error("worktree_busy");
		controller = new AbortController();
		stopped$1 = false;
		return async () => {
			stopped$1 = true;
			controller.abort(/* @__PURE__ */ new Error("worktree_stopped"));
			await Promise.allSettled([...operations$1.values()]);
		};
	},
	peek(directory) {
		return run$1(`peek:${resolve(directory)}`, async () => {
			const root = await realpath(directory);
			let gitRoot;
			try {
				gitRoot = await git(root, ["rev-parse", "--show-toplevel"]);
			} catch (error) {
				if (error instanceof Error && "code" in error && error.code === 128 && "stderr" in error && typeof error.stderr === "string" && error.stderr.includes("not a git repository")) return null;
				throw error;
			}
			if (!samePath(gitRoot, root)) return null;
			return {
				directory: root,
				remoteUrl: (await git(root, ["remote"])).split(String.fromCharCode(10)).includes("origin") ? await git(root, [
					"remote",
					"get-url",
					"origin"
				]) : null
			};
		});
	},
	async create(directory, ticketId, branch = "nexus/") {
		return run$1(`create:${resolve(directory)}:${ticketId}`, async () => {
			if (!isAbsolute(directory) || !/^[a-z0-9][\w-]*$/i.test(ticketId)) throw new Error("invalid_worktree_identity");
			branch ||= "nexus/";
			if (branch === "nexus/") branch += ticketId;
			if (branch.split("/").at(-1) !== ticketId) throw new Error("branch_ticket_mismatch");
			const root = await realpath(directory);
			if (!samePath(await git(root, ["rev-parse", "--show-toplevel"]), root)) throw new Error("repository_root_required");
			await git(root, [
				"check-ref-format",
				"--branch",
				branch
			]);
			const target = join(dirname(root), ".nexus-worktrees", basename(root), ticketId);
			try {
				await lstat(target);
			} catch (error) {
				if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
				await mkdir(dirname(target), { recursive: true });
				if (!samePath(await realpath(dirname(target)), dirname(target))) throw new Error("worktree_parent_conflict");
				await git(root, [
					"worktree",
					"add",
					"-b",
					branch,
					target,
					"HEAD"
				]);
				await worktree.verify(root, target, branch);
				return {
					branch,
					worktree: target
				};
			}
			await worktree.verify(root, target, branch);
			return {
				branch,
				worktree: target
			};
		});
	},
	async verify(directory, target, branch) {
		return run$1(`verify:${resolve(target)}`, async () => {
			const root = await realpath(directory);
			const actual = await realpath(target);
			if (samePath(root, actual) || !samePath(target, actual)) throw new Error("worktree_path_conflict");
			const registered = (await git(root, [
				"worktree",
				"list",
				"--porcelain",
				"-z"
			])).split("\0\0").map((entry) => entry.split("\0")).find((fields) => fields.some((field) => field.startsWith("worktree ") && samePath(field.slice(9), actual)));
			if (!registered || registered.some((field) => field === "locked" || field.startsWith("locked "))) throw new Error("worktree_registration_conflict");
			if (!samePath(resolve(root, await git(root, ["rev-parse", "--git-common-dir"])), resolve(actual, await git(actual, ["rev-parse", "--git-common-dir"]))) || await git(actual, ["branch", "--show-current"]) !== branch) throw new Error("worktree_branch_conflict");
		});
	}
});
async function git(cwd, args) {
	controller.signal.throwIfAborted();
	return (await execute("git", args, {
		cwd,
		signal: controller.signal,
		windowsHide: true,
		env: {
			...process.env,
			LC_ALL: "C"
		}
	})).stdout.trim();
}
function samePath(left, right) {
	return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
}
function run$1(key, action) {
	if (stopped$1) return Promise.reject(/* @__PURE__ */ new Error("worktree_stopped"));
	const current = operations$1.get(key);
	if (current) return current;
	const task = Promise.resolve().then(action).finally(() => operations$1.delete(key));
	operations$1.set(key, task);
	return task;
}
// src/service/project.ts
let syncing;
const project = defineService({
	async list() {
		const rows = await db.project.listAll();
		const workspaces = getServerContext(server).workspaceRegistry.list();
		return Promise.all(rows.map(async (current) => {
			const workspace = workspaces.find((workspace) => workspace.id === current.workspaceId);
			return {
				...current,
				available: workspace ? await workspace.status() === "ok" : false
			};
		}));
	},
	async open(id, signal) {
		const current = await db.project.findById(id);
		if (!current) throw new Error("project_not_found");
		const ctx = getServerContext(server);
		if (!ctx.sessionController.canOpenWorkspacePath()) throw new Error("native_open_unavailable");
		return ctx.sessionController.openWorkspacePath({ path: current.directory }, signal);
	},
	sync() {
		if (syncing) return syncing;
		syncing = synchronize().finally(() => {
			syncing = void 0;
		});
		return syncing;
	}
});
async function synchronize() {
	const registry = getServerContext(server).workspaceRegistry;
	for (const workspace of registry.list()) {
		if (await workspace.status() !== "ok") continue;
		const facts = await worktree.peek(workspace.path);
		if (!facts) continue;
		const current = await db.project.findByWorkspace(workspace.id);
		if (!current && !facts.remoteUrl) continue;
		await db.project.upsertWorkspace({
			id: current?.id ?? workspace.id,
			workspaceId: workspace.id,
			name: workspace.title,
			directory: facts.directory,
			remoteUrl: facts.remoteUrl
		}, (/* @__PURE__ */ new Date()).toISOString());
	}
	return db.project.listAll();
}
// src/server/routes/panel.get.ts
const getPanel = defineHandler(async () => {
	const [projects, tickets, runningWorkers, supervisors, scopes, links, threads, triggers, subscriptions, channelCatalog, messages, pending, settings, savedMainSessionId, openTickets, queuedWorkers] = await Promise.all([
		project.list(),
		db.ticket.listRecent(),
		db.worker.listRunning(),
		db.supervisor.listActive(),
		db.supervisorTicket.listAll(),
		db.ticketLink.listAll(),
		db.thread.listRecent(1e3),
		db.trigger.listRecent(),
		db.ticketThread.listAll(),
		channel.list(),
		db.inbox.listRecent(),
		db.inbox.listPending("user"),
		setting.load(),
		session.findMain(),
		db.ticket.listOpen(),
		db.worker.listQueued()
	]);
	async function binding(id, role, projectId) {
		if (!id) return {
			sessionId: null,
			status: "not_created"
		};
		const identity = await session.resolve(id);
		if (identity?.role !== role || role === "project" && identity.projectId !== projectId) return {
			sessionId: null,
			status: "not_created"
		};
		const activity = await session.activity(id);
		return {
			sessionId: id,
			status: activity.running ? "running" : activity.background ? "background" : activity.queued ? "queued" : "idle"
		};
	}
	const [mainBinding, projectBindings] = await Promise.all([binding(savedMainSessionId, "main"), Promise.all(projects.map(async (project) => ({
		id: project.id,
		...await binding(project.orchestratorSessionId ?? null, "project", project.id)
	})))]);
	const mainSessionId = mainBinding.sessionId;
	const projectSessions = new Map(projectBindings.map((project) => [project.id, project]));
	const activeWorkers = [...new Map([...queuedWorkers, ...runningWorkers].map((worker) => [worker.id, worker])).values()];
	const runningTicketIds = new Set(runningWorkers.map((worker) => worker.ticketId));
	const ticketMap = new Map(openTickets.map((ticket) => [ticket.id, ticket]));
	const missingIds = [...new Set(activeWorkers.map((worker) => worker.ticketId))].filter((id) => !ticketMap.has(id));
	for (const ticket of await Promise.all(missingIds.map((id) => db.ticket.findById(id)))) if (ticket) ticketMap.set(ticket.id, ticket);
	const currentTickets = [...ticketMap.values()].filter((ticket) => ![
		"closed",
		"done",
		"cancelled"
	].includes(ticket.status) || runningTicketIds.has(ticket.id));
	const currentTicketIds = new Set(currentTickets.map((ticket) => ticket.id));
	const currentWorkers = activeWorkers.filter((worker) => currentTicketIds.has(worker.ticketId) && (worker.status === "running" || ![
		"closed",
		"done",
		"cancelled"
	].includes(ticketMap.get(worker.ticketId).status)));
	const currentProjects = projects.filter((project) => [
		"running",
		"background",
		"queued"
	].includes(projectSessions.get(project.id).status));
	const hasRuntime = currentTickets.length > 0 || currentProjects.length > 0 || [
		"running",
		"background",
		"queued"
	].includes(mainBinding.status);
	const channels = channelCatalog.filter((channel) => channel.configured && channel.supported && currentTickets.some((ticket) => ticket.channelId === channel.id));
	const nodes = [
		...channels.length ? [{
			id: "channel",
			kind: "channel",
			label: channels.map((channel) => channel.name).join(" · "),
			status: "configured",
			projectId: null,
			ticketId: null,
			sessionId: null
		}] : [],
		...hasRuntime ? [{
			id: "orchestrator",
			kind: "orchestrator",
			label: mainSessionId ?? "",
			status: mainBinding.status,
			projectId: null,
			ticketId: null,
			sessionId: mainSessionId
		}] : [],
		...currentProjects.map((project) => ({
			id: `project:${project.id}`,
			kind: "project",
			label: project.name,
			status: projectSessions.get(project.id).status,
			projectId: project.id,
			ticketId: null,
			sessionId: projectSessions.get(project.id).sessionId
		})),
		...currentTickets.map((ticket) => ({
			id: `ticket:${ticket.id}`,
			kind: "ticket",
			label: ticket.title,
			status: ticket.paused ? "paused" : ticket.prepareError ? "error" : ticket.status,
			projectId: ticket.projectId,
			ticketId: ticket.id,
			sessionId: null
		})),
		...currentWorkers.map((worker) => ({
			id: `worker:${worker.id}`,
			kind: "worker",
			label: worker.title,
			status: worker.status,
			projectId: ticketMap.get(worker.ticketId).projectId,
			ticketId: worker.ticketId,
			sessionId: worker.status === "running" ? worker.id : null
		}))
	];
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges = [
		{
			source: "channel",
			target: "orchestrator",
			kind: "flow"
		},
		...currentProjects.map((project) => ({
			source: "orchestrator",
			target: `project:${project.id}`,
			kind: "flow"
		})),
		...currentTickets.map((ticket) => ({
			source: `project:${ticket.projectId}`,
			target: `ticket:${ticket.id}`,
			kind: "flow"
		})),
		...currentWorkers.map((worker) => ({
			source: `ticket:${worker.ticketId}`,
			target: `worker:${worker.id}`,
			kind: "flow"
		})),
		...links.map((link) => ({
			source: `ticket:${link.ticketId}`,
			target: `ticket:${link.relatedId}`,
			kind: link.kind === "depends" ? "dependency" : "association"
		}))
	].filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
	const groups = supervisors.map((supervisor) => ({
		id: `supervisor:${supervisor.id}`,
		label: supervisor.title,
		sessionId: supervisor.sessionId,
		nodeIds: [...new Set(scopes.filter((scope) => scope.supervisorId === supervisor.id).flatMap((scope) => {
			const ticket = currentTickets.find((ticket) => ticket.id === scope.ticketId);
			return ticket && nodeIds.has(`project:${ticket.projectId}`) ? [`project:${ticket.projectId}`] : [];
		}))]
	})).filter((group) => group.nodeIds.length);
	const failed = messages.find((message) => message.status === "stalled" || message.status === "pending" && message.deliveryError);
	const activities = [mainBinding, ...projectBindings];
	const run = {
		state: failed ? "delivery_failed" : runningWorkers.length || activities.some((activity) => activity.status === "running" || activity.status === "background") ? "running" : currentWorkers.some((worker) => worker.status === "queued") || activities.some((activity) => activity.status === "queued") ? "queued" : "idle",
		reason: failed?.deliveryError ?? null
	};
	return {
		projects,
		tickets,
		mainSessionId,
		graph: {
			nodes,
			edges,
			groups
		},
		run,
		inbox: {
			pending,
			resolved: messages.filter((message) => message.type === "user" && message.status === "done"),
			blocked: tickets.filter((ticket) => ticket.paused)
		},
		topics: {
			threads,
			triggers,
			subscriptions
		},
		deliveries: messages,
		channels: channelCatalog,
		settings
	};
});
// src/server/routes/project.opening.ts
const postProjectOpening = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	if (!id?.trim()) throw new HTTPError({
		status: 400,
		message: "project_id_required"
	});
	try {
		return await project.open(id, event.req.signal);
	} catch (error) {
		const message = error instanceof Error ? error.message : "repository_open_failed";
		throw new HTTPError({
			status: message === "project_not_found" ? 404 : message === "native_open_unavailable" ? 503 : 502,
			message
		});
	}
});
// src/server/routes/project.patch.ts
const patchProject = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	const body = await readBody(event);
	if (!id?.trim() || !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "enabled") || typeof body.enabled !== "boolean") throw new HTTPError({
		status: 400,
		message: "invalid_enabled"
	});
	const current = await db.project.findById(id);
	if (!current) throw new HTTPError({
		status: 404,
		message: "not_found"
	});
	if (body.enabled && !current.remoteUrl?.trim()) throw new HTTPError({
		status: 409,
		message: "repository_identity_unverified"
	});
	const project = await db.project.setEnabled(id, body.enabled, (/* @__PURE__ */ new Date()).toISOString());
	if (!project) throw new HTTPError({
		status: 409,
		message: "project_unavailable"
	});
	return project;
});
// src/server/routes/project.post.ts
const postProjects = defineHandler(async () => project.sync());
// src/server/routes/project.session.ts
const putProjectSession = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	if (!id?.trim()) throw new HTTPError({
		status: 400,
		message: "project_id_required"
	});
	try {
		return { sessionId: await session.create("project", { projectId: id }) };
	} catch (error) {
		const message = error instanceof Error ? error.message : "session_open_failed";
		throw new HTTPError({
			status: message === "project_not_found" ? 404 : message === "session_binding_conflict" ? 409 : message === "runtime_stopping" ? 503 : 502,
			message
		});
	}
});
// src/server/routes/session.context.get.ts
const getContext = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	if (!id?.trim()) throw new HTTPError({
		status: 400,
		message: "invalid_session"
	});
	const identity = await session.resolve(id);
	if (!identity) throw new HTTPError({
		status: 404,
		message: "unknown_session"
	});
	const context = await session.view(id, 0, 12e3);
	return {
		sessionId: id,
		role: identity.role,
		pendingCount: (await inbox.peek(id)).pendingCount,
		...context
	};
});
// src/server/routes/session.mailbox.get.ts
const getMailbox = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	if (!id?.trim()) throw new HTTPError({
		status: 400,
		message: "invalid_session"
	});
	return { mailbox: await inbox.peek(id) };
});
// src/server/routes/session.mailbox.patch.ts
const patchMail = defineHandler(async (event) => {
	const body = await readBody(event);
	if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "status") || body.status !== "done") throw new HTTPError({
		status: 400,
		message: "invalid_mail_patch"
	});
	const id = getRouterParam(event, "id", { decode: true });
	const messageId = getRouterParam(event, "messageId", { decode: true });
	if (!id?.trim() || !messageId?.trim()) throw new HTTPError({
		status: 400,
		message: "invalid_parameters"
	});
	const mailbox = await inbox.peek(id);
	if (!mailbox) throw new HTTPError({
		status: 404,
		message: "unknown_session"
	});
	const message = mailbox.messages.find((message) => message.id === messageId);
	if (!message) throw new HTTPError({
		status: 403,
		message: "scope_denied"
	});
	if (message.kind === "ask") throw new HTTPError({
		status: 409,
		message: "answer_required"
	});
	return { completed: await inbox.complete(id, [messageId]) };
});
// src/server/routes/session.open.post.ts
const putMainSession = defineHandler(async () => {
	try {
		return { sessionId: await session.create("main", {}) };
	} catch (error) {
		const message = error instanceof Error ? error.message : "session_open_failed";
		throw new HTTPError({
			status: message === "ambiguous_main_session" ? 409 : message === "runtime_stopping" ? 503 : 502,
			message
		});
	}
});
// src/server/routes/setting.patch.ts
const patchSettings = defineHandler(async (event) => {
	const body = await readBody(event);
	if (!body) throw new HTTPError({
		status: 400,
		message: "invalid_config"
	});
	try {
		return await setting.save(body);
	} catch (error) {
		if (error instanceof TypeError && error.message === "invalid_config") throw new HTTPError({
			status: 400,
			message: "invalid_config"
		});
		throw error;
	}
});
// src/server/routes/ticket.get.ts
const getTicket = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	if (!id?.trim()) throw new HTTPError({
		status: 400,
		message: "invalid_ticket"
	});
	const ticket = await db.ticket.findById(id);
	if (!ticket) throw new HTTPError({
		status: 404,
		message: "not_found"
	});
	const [project, executions, outgoing, incoming, subscriptions, inbox] = await Promise.all([
		db.project.findById(ticket.projectId),
		db.worker.listByTicket(id),
		db.ticketLink.listByTicket(id),
		db.ticketLink.listByRelated(id),
		db.ticketThread.listByTicket(id),
		db.inbox.listByTicket(id)
	]);
	const topics = (await Promise.all(subscriptions.map((link) => db.thread.findById(link.threadId)))).filter((topic) => topic !== void 0);
	const triggers = (await Promise.all(topics.map((topic) => db.trigger.listByThread(topic.id)))).flat();
	const dependencies = [...outgoing, ...incoming.filter((link) => !outgoing.some((other) => other.ticketId === link.ticketId && other.relatedId === link.relatedId && other.kind === link.kind))];
	return {
		ticket,
		project: project ?? null,
		executions,
		dependencies,
		subscriptions,
		topics,
		triggers,
		inbox
	};
});
// src/server/routes/ticket.patch.ts
const patchTicket = defineHandler(async (event) => {
	const id = getRouterParam(event, "id", { decode: true });
	const body = await readBody(event);
	if (!id?.trim() || !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "reason" && key !== "paused") || typeof body.paused !== "boolean" || typeof body.reason !== "string" || !body.reason.trim()) throw new HTTPError({
		status: 400,
		message: "invalid_ticket_patch"
	});
	const ticket = await db.ticket.findById(id);
	if (!ticket) throw new HTTPError({
		status: 404,
		message: "not_found"
	});
	if (ticket.status === "done" || ticket.status === "cancelled") throw new HTTPError({
		status: 409,
		message: "ticket_closed"
	});
	const updated = await db.ticket.setPausedIfOpen(id, body.paused, (/* @__PURE__ */ new Date()).toISOString());
	if (!updated) throw new HTTPError({
		status: 409,
		message: "ticket_closed"
	});
	return updated;
});
// src/server/index.ts
const authorize = defineHandler(async (event) => {
	const options = getServerOptions(event);
	event.res.headers.set("cache-control", "no-store");
	const origin = event.req.headers.get("origin");
	const host = event.req.headers.get("host");
	if (origin && origin !== options.origin || host && host !== new URL(options.origin).host) throw new HTTPError({
		status: 403,
		message: "origin_denied"
	});
	if (!options.owner || !await options.owner(event)) throw new HTTPError({
		status: 401,
		message: "owner_required"
	});
});
const server = defineWebServer((app) => {
	app.use(authorize);
	app.get("/api/nexus/panel", getPanel);
	app.get("/api/nexus/tickets/:id", getTicket);
	app.patch("/api/nexus/tickets/:id", patchTicket);
	app.put("/api/nexus/channels/:id/configuration", putChannelConfiguration);
	app.delete("/api/nexus/channels/:id/credentials", deleteChannelCredentials);
	app.post("/api/nexus/channels/:id/authentications", postChannelAuthentication);
	app.get("/api/nexus/channels/:id/authentications/:authenticationId", getChannelAuthentication);
	app.patch("/api/nexus/projects/:id", patchProject);
	app.post("/api/nexus/projects", postProjects);
	app.put("/api/nexus/projects/:id/session", putProjectSession);
	app.post("/api/nexus/projects/:id/openings", postProjectOpening);
	app.put("/api/nexus/sessions/main", putMainSession);
	app.patch("/api/nexus/settings", patchSettings);
	app.post("/api/nexus/asks/:id/answers", postAnswer);
	app.get("/api/nexus/sessions/:id/context", getContext);
	app.get("/api/nexus/sessions/:id/mailbox", getMailbox);
	app.patch("/api/nexus/sessions/:id/mailbox/:messageId", patchMail);
});
// src/service/channel.ts
const presets = [
	{
		id: "github",
		name: "GitHub"
	},
	{
		id: "gitlab",
		name: "GitLab"
	},
	{
		id: "feishu",
		name: "飞书"
	}
];
let writing = Promise.resolve();
const channel = defineService({
	async list() {
		const [rows, accounts] = await Promise.all([db.channel.listAll(), db.channelAccount.listAll()]);
		return Promise.all(presets.map(async (preset) => {
			const row = rows.find((row) => row.id === preset.id);
			const members = accounts.filter((account) => account.channelId === preset.id).map(({ id, channelId, role, name, avatar, status, createdAt }) => ({
				id,
				channelId,
				role,
				name,
				avatar,
				status,
				createdAt
			}));
			const supported = preset.id !== "feishu";
			const hasCredential = preset.id !== "feishu" && (await credentials().describe(ref(preset.id))).configured;
			const enabled = supported && Boolean(row?.enabled);
			const stored = await db.sourceState.find(preset.id, "configuration");
			const configured = hasCredential || members.length > 0 || Boolean(stored);
			const metadata = readMetadata(stored?.value, preset.id);
			return {
				id: preset.id,
				kind: preset.id,
				name: row?.name ?? preset.name,
				host: row?.host ?? (preset.id === "gitlab" ? "https://gitlab.com" : null),
				enabled,
				createdAt: row?.createdAt ?? "",
				accounts: members,
				configured,
				supported,
				hasCredential,
				status: !supported ? "unsupported" : !configured ? "unconfigured" : !enabled ? "disabled" : members.some((account) => account.role === "bot" && account.status === "online") ? "online" : "offline",
				...metadata
			};
		}));
	},
	connection(kind) {
		const operation = writing.then(async () => {
			const row = await db.channel.findById(kind);
			const token = kind === "feishu" ? void 0 : (await credentials().resolve(ref(kind)))?.value;
			return Object.freeze({
				host: row?.host ?? (kind === "gitlab" ? "https://gitlab.com" : null),
				token,
				enabled: kind !== "feishu" && Boolean(row?.enabled)
			});
		});
		writing = operation.then(() => void 0, () => void 0);
		return operation;
	},
	async resolveCredential(kind) {
		if (kind === "feishu") return void 0;
		return (await credentials().resolve(ref(kind)))?.value;
	},
	removeCredentials(kind) {
		const operation = writing.then(() => removeCredentials(kind));
		writing = operation.catch(() => void 0);
		return operation;
	},
	save(kind, patch) {
		const operation = writing.then(() => save(kind, patch));
		writing = operation.catch(() => void 0);
		return operation;
	}
});
function credentials() {
	return getServerContext(server).credentials;
}
function ref(kind) {
	return credentialRef(kind === "github" ? "NEXUS_GITHUB_TOKEN" : "NEXUS_GITLAB_TOKEN");
}
function readMetadata(raw, kind) {
	if (!raw) return {
		commitName: "",
		commitEmail: ""
	};
	const value = JSON.parse(raw);
	if (!value || typeof value !== "object" || !("commitName" in value) || !("commitEmail" in value) || typeof value.commitName !== "string" || typeof value.commitEmail !== "string") throw new Error("invalid_channel_metadata");
	if (kind === "gitlab" && "expectedAccount" in value && typeof value.expectedAccount !== "string") throw new Error("invalid_channel_metadata");
	return {
		commitName: value.commitName,
		commitEmail: value.commitEmail,
		...kind === "gitlab" && "expectedAccount" in value && value.expectedAccount ? { expectedAccount: value.expectedAccount } : {}
	};
}
async function removeCredentials(kind) {
	if (kind !== "github" && kind !== "gitlab") throw new TypeError("channel_unsupported");
	const previous = await credentials().resolve(ref(kind));
	await credentials().unset(ref(kind));
	try {
		await db.channel.removeCredentials(kind);
	} catch {
		if (previous) await credentials().set(ref(kind), previous.value);
		throw new Error("channel_credentials_delete_failed");
	}
	return (await channel.list()).find((item) => item.kind === kind);
}
async function save(kind, patch) {
	if (kind !== "github" && kind !== "gitlab") throw new TypeError("channel_unsupported");
	if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => ![
		"host",
		"enabled",
		"expectedAccount",
		"commitName",
		"commitEmail",
		"token"
	].includes(key)) || patch.enabled !== void 0 && typeof patch.enabled !== "boolean" || [
		"host",
		"commitName",
		"commitEmail",
		"token"
	].some((key) => patch[key] !== void 0 && typeof patch[key] !== "string")) throw new TypeError("invalid_channel_config");
	if (patch.token !== void 0 && (!patch.token.trim() || patch.token.length > 8192 || /[\r\n]/.test(patch.token))) throw new TypeError("invalid_channel_token");
	if ((patch.commitName?.length ?? 0) > 200 || (patch.commitEmail?.length ?? 0) > 254 || /[\r\n]/.test((patch.commitName ?? "") + (patch.commitEmail ?? "")) || patch.commitEmail && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(patch.commitEmail.trim())) throw new TypeError("invalid_commit_identity");
	if (kind === "gitlab" && patch.expectedAccount !== void 0 && (typeof patch.expectedAccount !== "string" || patch.expectedAccount.length > 100 || patch.expectedAccount.trim() && !/^[a-z0-9][\w.-]*$/i.test(patch.expectedAccount.trim()))) throw new TypeError("invalid_expected_account");
	const current = (await channel.list()).find((item) => item.kind === kind);
	const expectedAccount = kind === "gitlab" ? patch.expectedAccount?.trim() ?? current.expectedAccount : void 0;
	let url;
	try {
		url = new URL(patch.host ?? current.host ?? (kind === "github" ? "https://github.com" : "https://gitlab.com"));
	} catch {
		throw new TypeError("invalid_channel_host");
	}
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || kind === "github" && url.origin !== "https://github.com") throw new TypeError("invalid_channel_host");
	const hostChanged = kind === "gitlab" && url.origin !== new URL(current.host ?? "https://gitlab.com").origin;
	const token = patch.token?.trim();
	let account;
	if (hostChanged && (current.hasCredential || current.accounts.length > 0) && !token) throw new TypeError("channel_account_required");
	if (token) {
		const endpoint = kind === "github" ? "https://api.github.com/user" : `${url.origin}/api/v4/user`;
		const env = await channelProxyEnvironment(new URL(endpoint), process.env);
		const dispatcher = await createRouteDispatcher({ get: (name) => env[name] === void 0 ? void 0 : { value: env[name] } }, { allowH2: false });
		try {
			let response;
			try {
				response = await fetch(endpoint, {
					dispatcher,
					headers: {
						authorization: `Bearer ${token}`,
						accept: kind === "github" ? "application/vnd.github+json" : "application/json"
					},
					signal: AbortSignal.timeout(15e3),
					redirect: "error"
				});
			} catch {
				throw new Error("channel_verification_failed");
			}
			if (!response.ok) {
				await response.body?.cancel();
				throw new Error("channel_auth_failed");
			}
			let identity;
			try {
				identity = await response.json();
			} catch {
				throw new Error("channel_auth_failed");
			}
			if (!identity || typeof identity !== "object" || Array.isArray(identity)) throw new Error("channel_auth_failed");
			const user = identity;
			const login = kind === "github" ? user.login : user.username ?? user.name;
			if (typeof login !== "string" || !login.trim() || login.length > 200 || /[\r\n]/.test(login)) throw new Error("channel_auth_failed");
			if (expectedAccount && (typeof user.username !== "string" || user.username.toLowerCase() !== expectedAccount.toLowerCase())) throw new TypeError("channel_identity_mismatch");
			account = {
				name: login.trim(),
				avatar: null
			};
		} finally {
			await dispatcher.close();
		}
	}
	if (kind === "gitlab" && !token && expectedAccount && current.accounts.some((account) => account.role === "bot" && account.name.toLowerCase() !== expectedAccount.toLowerCase())) throw new TypeError("channel_identity_mismatch");
	const enabled = patch.enabled ?? (Boolean(account) || current.enabled);
	if (enabled && !account && !current.accounts.some((account) => account.role === "bot" && account.status === "online")) throw new TypeError("channel_account_required");
	const previous = token ? await credentials().resolve(ref(kind)) : void 0;
	if (token) await credentials().set(ref(kind), token);
	try {
		await db.channel.saveConfiguration(kind, current.name, kind === "gitlab" ? url.origin : null, enabled, {
			commitName: patch.commitName?.trim() ?? current.commitName,
			commitEmail: patch.commitEmail?.trim() ?? current.commitEmail,
			...expectedAccount ? { expectedAccount } : {}
		}, account, ...hostChanged ? [true] : []);
	} catch {
		if (token) {
			if (previous) await credentials().set(ref(kind), previous.value);
			else await credentials().unset(ref(kind));
		}
		throw new Error("channel_save_failed");
	}
	return (await channel.list()).find((item) => item.kind === kind);
}
// src/channel/github/runner.ts
var GhError = class extends Error {
	code;
	retryAfterSeconds;
	constructor(code, retryAfterSeconds) {
		super(code);
		this.code = code;
		this.retryAfterSeconds = retryAfterSeconds;
	}
};
var ExecFileGhRunner = class {
	async request(request) {
		if (request.signal?.aborted) throw new GhError("interrupted");
		const token = await channel.resolveCredential("github");
		if (request.signal?.aborted) throw new GhError("interrupted");
		if (!token?.trim()) throw new GhError("not_logged_in");
		const env = await channelProxyEnvironment(new URL(`https://${request.site}`), process.env);
		for (const key of Object.keys(env)) if ([
			"GH_TOKEN",
			"GITHUB_TOKEN",
			"GH_ENTERPRISE_TOKEN",
			"GITHUB_ENTERPRISE_TOKEN"
		].includes(key.toUpperCase())) delete env[key];
		env.GH_TOKEN = token;
		const args = [
			"api",
			"--hostname",
			request.site,
			"--method",
			request.method,
			"--include",
			request.path
		];
		if (request.body) args.push("--input", "-");
		return new Promise((resolve, reject) => {
			const child = execFile("gh", args, {
				signal: request.signal,
				timeout: 3e4,
				maxBuffer: 16777216,
				env
			}, (error, stdout, stderr) => {
				const response = stdout.replace(/\r\n/g, "\n");
				const status = Number(/^HTTP\/\S+ (\d+)/m.exec(response)?.[1]);
				const retryAfter = /^retry-after: (\d+)/im.exec(response)?.[1];
				if (error) {
					const code = error.code;
					reject(new GhError(code === "ENOENT" ? "gh_missing" : status === 401 || /gh auth login|not logged/i.test(stderr) ? "not_logged_in" : status === 429 || /rate limit/i.test(stderr) ? "rate_limited" : status === 403 ? "forbidden" : status === 404 ? "not_found" : status >= 400 && status < 500 ? "remote_rejected" : code === "ABORT_ERR" ? "interrupted" : "transport_unknown", retryAfter ? Number(retryAfter) : void 0));
					return;
				}
				try {
					const separator = response.indexOf("\n\n");
					if (separator < 0) throw new GhError("invalid_response");
					const body = response.slice(separator + 2).trim();
					resolve(body ? JSON.parse(body) : null);
				} catch {
					reject(new GhError("invalid_response"));
				}
			});
			if (request.body) child.stdin.end(JSON.stringify(request.body));
		});
	}
};
// src/channel/github/channel.ts
var GitHubChannel = class {
	runner;
	operations = /* @__PURE__ */ new Map();
	publishing = /* @__PURE__ */ new Map();
	constructor(runner = new ExecFileGhRunner()) {
		this.runner = runner;
	}
	exclusive(key, action) {
		const current = this.operations.get(key);
		if (current) return current;
		const task = action().finally(() => this.operations.delete(key));
		this.operations.set(key, task);
		return task;
	}
	async request(path, signal, method = "GET", body) {
		signal?.throwIfAborted();
		return this.runner.request({
			site: "github.com",
			path,
			method,
			body,
			signal
		});
	}
	async state(repository, name) {
		const row = await db.sourceState.find("github", `${repository}:${name}`);
		return row ? JSON.parse(row.value) : void 0;
	}
	async save(repository, name, value) {
		await db.sourceState.set("github", `${repository}:${name}`, JSON.stringify(value), now$1());
	}
	async project(projectId) {
		const project = await db.project.findById(projectId);
		if (!project || !repositoryOf(project.remoteUrl)) throw new GhError("unknown_repository");
		if (!project.enabled) throw new GhError("project_disabled");
		return project;
	}
	async projectForRepository(repository) {
		const projects = (await db.project.listAll()).filter((project) => repositoryOf(project.remoteUrl) === repository);
		if (projects.length !== 1) throw new GhError(projects.length ? "ambiguous_repository" : "unknown_repository");
		return projects[0];
	}
	async verifyEnvironment(projectId, signal) {
		const project = await this.project(projectId);
		if (!(await db.channel.findById("github"))?.enabled) throw new GhError("channel_disabled");
		const bots = (await db.channelAccount.findByRole("github", "bot")).filter((account) => account.status === "online");
		const account = record$1(await this.request("user", signal));
		const providerId = identity$1(account.id);
		const login = text$1(account.login);
		if (!bots.some((bot) => bot.name.toLowerCase() === login.toLowerCase())) throw new GhError("account_mismatch");
		const repository = repositoryOf(project.remoteUrl);
		const remote = record$1(await this.request(`repos/${repository}`, signal));
		if (text$1(remote.full_name).toLowerCase() !== repository) throw new GhError("repository_mismatch");
		const result = {
			providerId,
			login,
			repositoryId: identity$1(remote.id),
			defaultBranch: typeof remote.default_branch === "string" ? remote.default_branch : null
		};
		const previous = await this.state(repository, "verified_environment");
		if (previous && (previous.providerId !== providerId || previous.repositoryId !== result.repositoryId)) throw new GhError("environment_identity_changed");
		await this.save(repository, "verified_environment", result);
		return result;
	}
	async pages(path, signal) {
		const result = [];
		for (let page = 1;; page++) {
			const batch = array$1(await this.request(`${path + (path.includes("?") ? "&" : "?")}per_page=100&page=${page}`, signal)).map(record$1);
			result.push(...batch);
			if (batch.length < 100) return result;
		}
	}
	async read(resource, offset = 0, limit = 50, signal) {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GhError("invalid_pagination");
		const target = parseResource$1(resource);
		const project = await this.projectForRepository(target.repository);
		if (!project) throw new GhError("unknown_repository");
		await this.verifyEnvironment(project.id, signal);
		const root = `repos/${target.repository}`;
		const main = record$1(await this.request(root + (target.kind === "pull" ? "/pulls/" : "/issues/") + target.number, signal));
		validateTopic$1(main, target);
		const items = [item$1(main, target.kind)];
		for (const row of await this.pages(`${root}/issues/${target.number}/comments`, signal)) items.push(item$1(row, "comment"));
		if (target.kind === "pull") {
			for (const row of await this.pages(`${root}/pulls/${target.number}/reviews`, signal)) items.push(item$1(row, "review"));
			for (const row of await this.pages(`${root}/pulls/${target.number}/comments`, signal)) items.push(item$1(row, "review_comment"));
		}
		items.splice(1, items.length - 1, ...items.slice(1).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
		return {
			items: items.slice(offset, offset + limit),
			next_offset: offset + limit < items.length ? offset + limit : null,
			next_resource: null
		};
	}
	async collectAll(signal) {
		signal?.throwIfAborted();
		if (!(await db.channel.findById("github"))?.enabled) return [];
		const result = [];
		for (const project of await db.project.listAll()) {
			signal?.throwIfAborted();
			if (!project.enabled || !repositoryOf(project.remoteUrl)) continue;
			result.push({
				projectId: project.id,
				...await this.collect(project.id, signal)
			});
		}
		return result;
	}
	async collect(projectId, signal) {
		return this.exclusive(`collect:${projectId}`, async () => {
			const errors = [];
			const attempt = async (operation) => {
				try {
					await operation();
				} catch (error) {
					if (signal?.aborted) throw error;
					errors.push(failure$1(error));
				}
			};
			try {
				const project = await this.project(projectId);
				const environment = await this.verifyEnvironment(projectId, signal);
				const repository = repositoryOf(project.remoteUrl);
				const baseline = await this.state(repository, "baseline") ?? now$1();
				await this.save(repository, "baseline", baseline);
				await attempt(() => this.stream(repository, "topics", `repos/${repository}/issues?state=all&sort=updated&direction=asc`, baseline, async (row) => {
					const target = {
						repository,
						number: number$1(row.number),
						kind: row.pull_request ? "pull" : "issue"
					};
					validateTopic$1(row, target);
					const thread = await this.ensureThread(target, row);
					await this.ingest(thread, row, target.kind === "issue" && row.state === "closed" ? "close" : "open", baseline);
					if (target.kind === "pull") {
						const result = await this.collectPullRequest(projectId, thread.id, signal);
						if (!result.ok) throw new GhError(result.reason);
					}
				}, signal));
				await attempt(() => this.stream(repository, "comments", `repos/${repository}/issues/comments?sort=updated&direction=asc`, baseline, async (row) => {
					const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(text$1(row.issue_url));
					if (!match || match[1].toLowerCase() !== repository) throw new GhError("source_repository_mismatch");
					const thread = await db.thread.findByRef("github", `${repository}:${match[2]}`);
					if (thread) {
						await this.acceptAnswers(thread, row);
						await this.ingest(thread, row, "comment", baseline);
					}
				}, signal));
				for (const thread of await db.thread.listByChannel("github")) {
					if (thread.kind !== "pull" || !thread.url || !(await db.ticketThread.listTicketIds(thread.id)).length) continue;
					await attempt(async () => {
						const target = parseResource$1(thread.url);
						if (target.repository !== repository) return;
						const root = `repos/${repository}/pulls/${target.number}`;
						for (const [path, kind] of [["reviews", "review"], ["comments", "review_comment"]]) await attempt(async () => {
							for (const row of await this.pages(`${root}/${path}`, signal)) {
								await this.acceptAnswers(thread, row);
								await this.ingest(thread, row, "comment", baseline, kind);
							}
						});
						const result = await this.collectPullRequest(projectId, thread.id, signal);
						if (!result.ok) throw new GhError(result.reason);
					});
				}
				if (environment.defaultBranch) await attempt(() => this.collectBranch(projectId, environment.defaultBranch, signal));
				await this.save(repository, "collection_status", {
					ok: !errors.length,
					reasons: [...new Set(errors)],
					collectedAt: now$1()
				});
			} catch (error) {
				if (signal?.aborted) throw error;
				errors.push(failure$1(error));
			}
			return errors.length ? {
				ok: false,
				reason: [...new Set(errors)].join(",")
			} : { ok: true };
		});
	}
	async stream(repository, name, path, baseline, accept, signal) {
		const cursor = await this.state(repository, `cursor:${name}`) ?? { since: baseline };
		const startedAt = now$1();
		const rows = await this.pages(`${path}&since=${encodeURIComponent(cursor.since)}`, signal);
		const revisions = [];
		let firstError;
		for (const row of rows) {
			signal?.throwIfAborted();
			try {
				await accept(row);
			} catch (error) {
				if (signal?.aborted) throw error;
				firstError ??= error;
			}
			revisions.push(digest$1(row));
		}
		if (firstError) throw firstError;
		const signature = digest$1(revisions.sort());
		await this.save(repository, `cursor:${name}`, cursor.signature === signature && cursor.through ? { since: cursor.through } : {
			since: cursor.since,
			signature,
			through: startedAt
		});
	}
	async ensureThread(target, row) {
		const refId = `${target.repository}:${target.number}`;
		const value = {
			id: (await db.thread.findByRef("github", refId))?.id ?? `github:${refId}`,
			channelId: "github",
			refId,
			kind: target.kind,
			title: text$1(row.title),
			url: text$1(row.html_url),
			createdAt: timestamp$1(row.created_at),
			updatedAt: timestamp$1(row.updated_at),
			projectId: null,
			triage: "pending",
			triagedAt: null
		};
		return db.thread.record(value);
	}
	async ingest(thread, row, kind, baseline, sourceKind = kind) {
		const author = record$1(row.user);
		const actorName = text$1(author.login);
		const accounts = await db.channelAccount.findByChannel("github");
		const bots = accounts.filter((account) => account.role === "bot");
		const human = author.type !== "Bot" && !actorName.endsWith("[bot]") && !bots.some((bot) => bot.name.toLowerCase() === actorName.toLowerCase());
		const body = typeof row.body === "string" ? row.body : typeof row.state === "string" ? row.state : "";
		const mentioned = bots.some((bot) => new RegExp(`@${escapeRegex$1(bot.name)}(?![a-z0-9-])`, "i").test(body));
		const at = timestamp$1(row.updated_at ?? row.submitted_at ?? row.created_at);
		const id = `${thread.id}:${sourceKind}:${identity$1(row.id)}:${digest$1({
			body,
			at
		}).slice(0, 16)}`;
		const trigger = {
			id,
			channelId: "github",
			threadId: thread.id,
			kind,
			actorName,
			human: Number(human),
			mentioned: Number(mentioned),
			text: body,
			url: text$1(row.html_url),
			at,
			ref: row.head ? text$1(record$1(row.head).ref) : null
		};
		await db.trigger.ingest(trigger);
		const subscriptions = await db.ticketThread.listTicketIds(thread.id);
		const historical = timestamp$1(row.created_at ?? row.submitted_at) < baseline;
		const admin = accounts.some((account) => account.role === "admin" && account.name.toLowerCase() === actorName.toLowerCase());
		if (!human || historical && !subscriptions.length) return;
		if (!subscriptions.length && (!admin || kind !== "open" && !mentioned || thread.triage === "ignored" && !mentioned)) return;
		const targets = /* @__PURE__ */ new Map();
		for (const ticketId of subscriptions) {
			const ticket = await db.ticket.findById(ticketId);
			if (ticket && !["done", "cancelled"].includes(ticket.status)) targets.set(ticket.projectId, {
				projectId: ticket.projectId,
				ticketId
			});
		}
		if (!subscriptions.length) targets.set(thread.projectId ?? "main", {
			projectId: thread.triage === "claimed" ? thread.projectId : null,
			ticketId: null
		});
		for (const [key, target] of targets) {
			const inboxId = `${id}:inbox:${key}`;
			await db.inbox.enqueue({
				id: inboxId,
				type: target.projectId ? "project" : "main",
				origin: "channel",
				kind: "trigger",
				message: body,
				title: thread.title,
				projectId: target.projectId,
				ticketId: target.ticketId,
				triggerId: id,
				threadId: thread.id
			});
		}
	}
	async ci(root, head, signal) {
		const previous = await this.state(root.slice(6), `ci_runs:${head}`);
		const checks = /* @__PURE__ */ new Map();
		const statuses = /* @__PURE__ */ new Map();
		const acceptCheck = (check) => {
			if (check.head_sha !== head) return;
			const key = `${identity$1(record$1(check.app).id)}:${text$1(check.name)}`;
			const prior = checks.get(key);
			if (!prior || number$1(check.id) > number$1(prior.id) || check.id === prior.id && !(prior.status === "completed" && check.status !== "completed") && timestamp$1(check.completed_at ?? check.started_at ?? check.created_at) >= timestamp$1(prior.completed_at ?? prior.started_at ?? prior.created_at)) checks.set(key, check);
		};
		const acceptStatus = (status) => {
			const key = text$1(status.context);
			const prior = statuses.get(key);
			if (!prior || timestamp$1(status.updated_at ?? status.created_at) > timestamp$1(prior.updated_at ?? prior.created_at) || timestamp$1(status.updated_at ?? status.created_at) === timestamp$1(prior.updated_at ?? prior.created_at) && number$1(status.id) > number$1(prior.id)) statuses.set(key, status);
		};
		for (const check of previous?.checks ?? []) acceptCheck(check);
		for (const status of previous?.statuses ?? []) acceptStatus(status);
		for (const kind of ["check-runs", "status"]) for (let page = 1;; page++) {
			const response = record$1(await this.request(`${root}/commits/${encodeURIComponent(head)}/${kind}?per_page=100&page=${page}`, signal));
			if (kind === "status" && response.sha !== head) throw new GhError("ci_head_mismatch");
			const rows = array$1(response[kind === "check-runs" ? "check_runs" : "statuses"]).map(record$1);
			for (const row of rows) (kind === "check-runs" ? acceptCheck : acceptStatus)(row);
			if (rows.length < 100) break;
		}
		const states = [...checks.values()].map((check) => check.status === "in_progress" ? "running" : check.status !== "completed" ? "pending" : [
			"success",
			"neutral",
			"skipped"
		].includes(String(check.conclusion)) ? "passing" : "failing");
		states.push(...[...statuses.values()].map((status) => status.state === "success" ? "passing" : status.state === "pending" ? "pending" : "failing"));
		const result = {
			state: states.includes("failing") ? "failing" : states.includes("running") ? "running" : !states.length || states.includes("pending") ? "pending" : "passing",
			checks: [...checks.values()],
			statuses: [...statuses.values()]
		};
		await this.save(root.slice(6), `ci_runs:${head}`, result);
		return result;
	}
	async collectPullRequest(projectId, threadId, signal) {
		return this.exclusive(`pull:${threadId}`, async () => {
			const project = await this.project(projectId);
			await this.verifyEnvironment(projectId, signal);
			const thread = await db.thread.findById(threadId);
			if (!thread?.url || thread.kind !== "pull") throw new GhError("invalid_pull_request");
			const target = parseResource$1(thread.url);
			if (target.repository !== repositoryOf(project.remoteUrl)) throw new GhError("source_repository_mismatch");
			const root = `repos/${target.repository}`;
			const remote = record$1(await this.request(`${root}/pulls/${target.number}`, signal));
			validateTopic$1(remote, target);
			const head = text$1(record$1(remote.head).sha);
			const base = record$1(remote.base);
			if (text$1(record$1(base.repo).full_name).toLowerCase() !== target.repository) throw new GhError("pull_request_mismatch");
			const state = remote.merged === true ? "merged" : remote.state === "open" ? "open" : remote.state === "closed" ? "closed" : null;
			if (!state) throw new GhError("invalid_response");
			const previous = await this.state(target.repository, `pr_fact:${target.number}`);
			const updatedAt = timestamp$1(remote.updated_at);
			if (previous && (previous.updatedAt > updatedAt || previous.state === "merged" && state !== "merged")) return {
				ok: false,
				reason: "stale_pr_snapshot"
			};
			let ciState = previous?.head === head ? previous.ciState : "pending";
			let ciError;
			let snapshot;
			try {
				snapshot = await this.ci(root, head, signal);
				ciState = snapshot.state;
			} catch (error) {
				if (signal?.aborted) throw error;
				ciError = failure$1(error);
			}
			const fact = {
				head,
				base: text$1(base.ref),
				state,
				ciState,
				collectedAt: now$1(),
				updatedAt,
				ciError,
				url: text$1(remote.html_url)
			};
			await this.save(target.repository, `pr_fact:${target.number}`, fact);
			const branch = typeof record$1(remote.head).ref === "string" ? text$1(record$1(remote.head).ref) : null;
			const worker = branch ? await db.worker.findRunningByBranch(branch) : void 0;
			const owned = worker && await db.ticket.findById(worker.ticketId);
			if (owned?.projectId === projectId && (!owned.prUrl || owned.prUrl === thread.url)) {
				await db.ticketThread.link(owned.id, thread.id, now$1());
				await db.ticket.setPullRequest(owned.id, thread.url, state, ciState);
			}
			const subscriptions = await db.ticketThread.listTicketIds(thread.id);
			for (const ticketId of subscriptions) {
				const ticket = await db.ticket.findById(ticketId);
				if (ticket?.projectId === projectId && ticket.prUrl === thread.url) await db.ticket.setPullRequest(ticketId, thread.url, state, ciState);
			}
			const fingerprint = digest$1({
				head,
				state,
				ciState,
				ciError,
				checks: snapshot?.checks,
				statuses: snapshot?.statuses
			});
			const ref = `${target.repository}:${target.number}`;
			const { row: watch } = await db.ciWatch.recordRevision({
				id: `github:pull:${ref}`,
				channelId: "github",
				kind: "pull",
				ref,
				fingerprint,
				head,
				updatedAt: now$1()
			});
			const triggerId = `${watch.id}:revision:${watch.revision}`;
			const message = `PR #${target.number}: ${state}, CI ${ciState}${ciError ? ` (${ciError})` : ""}`;
			await db.trigger.ingest({
				id: triggerId,
				channelId: "github",
				threadId,
				kind: "ci",
				actorName: null,
				human: 0,
				mentioned: 0,
				text: message,
				url: thread.url,
				at: now$1(),
				ref: head
			});
			for (const ticketId of subscriptions) {
				const ticket = await db.ticket.findById(ticketId);
				if (ticket?.projectId === projectId && !["done", "cancelled"].includes(ticket.status)) await db.inbox.enqueue({
					id: `${triggerId}:ticket:${ticketId}`,
					type: "project",
					origin: "system",
					kind: "notice",
					projectId,
					ticketId,
					triggerId,
					threadId,
					title: message,
					message
				});
			}
			return {
				ok: !ciError,
				...ciError ? { reason: ciError } : {}
			};
		});
	}
	async collectBranch(projectId, branch, signal) {
		const project = await this.project(projectId);
		await this.verifyEnvironment(projectId, signal);
		const repository = repositoryOf(project.remoteUrl);
		const head = text$1(record$1(await this.request(`repos/${repository}/commits/${encodeURIComponent(branch)}`, signal)).sha);
		const snapshot = await this.ci(`repos/${repository}`, head, signal);
		const failing = snapshot.checks.filter((check) => check.status === "completed" && ![
			"success",
			"neutral",
			"skipped"
		].includes(String(check.conclusion))).map((check) => text$1(check.name));
		failing.push(...snapshot.statuses.filter((status) => !["success", "pending"].includes(String(status.state))).map((status) => text$1(status.context)));
		const ref = `${repository}:branch:${branch}`;
		const { row: watch } = await db.ciWatch.recordRevision({
			id: `github:${ref}`,
			channelId: "github",
			kind: "branch",
			ref,
			fingerprint: digest$1({
				state: snapshot.state,
				failing: failing.sort()
			}),
			head,
			updatedAt: now$1()
		});
		if (watch.revision === 0 && !failing.length) return;
		const threadId = `github:${ref}`;
		await db.thread.record({
			id: threadId,
			channelId: "github",
			refId: ref,
			kind: "ci",
			title: `CI ${branch}`,
			url: null,
			projectId,
			triage: "claimed",
			triagedAt: now$1(),
			createdAt: now$1(),
			updatedAt: now$1()
		});
		const triggerId = `${watch.id}:revision:${watch.revision}`;
		const message = `${branch} CI ${snapshot.state}${failing.length ? `: ${failing.join(", ")}` : ""}`;
		await db.trigger.ingest({
			id: triggerId,
			channelId: "github",
			threadId,
			kind: "ci",
			actorName: null,
			human: 0,
			mentioned: 0,
			text: message,
			url: `https://github.com/${repository}/commit/${head}`,
			at: now$1(),
			ref: head
		});
		await db.inbox.enqueue({
			id: `${triggerId}:project:${projectId}`,
			type: "project",
			origin: "system",
			kind: "notice",
			projectId,
			triggerId,
			threadId,
			title: message,
			message
		});
	}
	async acceptAnswers(thread, row) {
		const author = record$1(row.user);
		const login = text$1(author.login);
		const accounts = await db.channelAccount.findByChannel("github");
		if (author.type !== "User" || login.endsWith("[bot]") || accounts.some((account) => account.role === "bot" && account.name.toLowerCase() === login.toLowerCase()) || !accounts.some((account) => account.role === "admin" && account.name.toLowerCase() === login.toLowerCase())) return;
		const body = typeof row.body === "string" ? row.body : "";
		const answers = /* @__PURE__ */ new Map();
		const conflicts = /* @__PURE__ */ new Set();
		let fenced = false;
		for (const line of body.split(/\r?\n/)) {
			if (/^\s*~{3}|^\s*```/.test(line)) {
				fenced = !fenced;
				continue;
			}
			if (fenced) continue;
			if (!/^answer[ \t]/i.test(line)) continue;
			const content = line.slice(7).trim();
			const separator = content.indexOf(": ");
			if (separator < 1) continue;
			const id = content.slice(0, separator).trim();
			const answer = content.slice(separator + 2).trim();
			if (!answer || /\s/.test(id)) continue;
			if (answers.has(id) && answers.get(id) !== answer) conflicts.add(id);
			answers.set(id, answer);
		}
		for (const [id, answer] of answers) {
			if (conflicts.has(id)) continue;
			const ask = await db.inbox.findById(id);
			if (!ask || ask.kind !== "ask" || ask.type !== "user" || ask.status !== "pending" || timestamp$1(row.created_at ?? row.submitted_at) < ask.createdAt) continue;
			const trigger = ask.triggerId && await db.trigger.findById(ask.triggerId);
			if (!trigger || trigger.threadId !== thread.id || ask.threadId && ask.threadId !== thread.id) continue;
			const target = parseResource$1(thread.url);
			if (!await this.state(target.repository, `comment:${id}`)) continue;
			if (ask.ticketId) {
				const ticket = await db.ticket.findById(ask.ticketId);
				if (!ticket || ["done", "cancelled"].includes(ticket.status)) continue;
			}
			await db.inbox.answerByUser(id, answer, now$1());
		}
	}
	async publish(inboxId, signal) {
		return this.exclusive(`publish:${inboxId}`, async () => {
			const row = await db.inbox.findById(inboxId);
			const trigger = row?.triggerId ? await db.trigger.findById(row.triggerId) : void 0;
			const key = trigger ? trigger.threadId : inboxId;
			const task = (this.publishing.get(key) ?? Promise.resolve()).then(() => this.publishOne(inboxId, signal));
			const barrier = task.then(() => void 0, () => void 0);
			this.publishing.set(key, barrier);
			try {
				return await task;
			} finally {
				if (this.publishing.get(key) === barrier) this.publishing.delete(key);
			}
		});
	}
	async destination(row) {
		if (row.type !== "user" || !["notice", "ask"].includes(row.kind) || !row.triggerId) throw new GhError("invalid_delivery");
		const trigger = await db.trigger.findById(row.triggerId);
		const thread = trigger && await db.thread.findById(trigger.threadId);
		if (!thread?.url || thread.channelId !== "github" || !["issue", "pull"].includes(thread.kind) || row.threadId && row.threadId !== thread.id) throw new GhError("no_reply_address");
		const target = parseResource$1(thread.url);
		const project = await this.projectForRepository(target.repository);
		if (!project) throw new GhError("unknown_repository");
		if (row.ticketId) {
			const ticket = await db.ticket.findById(row.ticketId);
			if (row.kind === "ask" && ticket && ["done", "cancelled"].includes(ticket.status)) throw new GhError("delivery_superseded");
			if (!ticket || ticket.projectId !== project.id) throw new GhError("scope_denied");
			if (ticket.paused) throw new GhError("human_paused");
			if (!(await db.ticketThread.listTicketIds(thread.id)).includes(ticket.id)) throw new GhError("unsubscribed_thread");
		}
		return {
			thread,
			target
		};
	}
	async publishOne(inboxId, signal) {
		let row = await db.inbox.findById(inboxId);
		if (!row) return {
			ok: false,
			reason: "unknown_delivery"
		};
		if (row.status === "done") return { ok: true };
		let posting = false;
		try {
			const { thread, target } = await this.destination(row);
			const project = await this.projectForRepository(target.repository);
			const environment = await this.verifyEnvironment(project.id, signal);
			const marker = `<!-- nexus:${row.id} -->`;
			const receipt = await this.state(target.repository, `comment:${row.id}`);
			if (receipt) {
				if (receipt.providerId !== environment.providerId || receipt.marker !== marker) throw new GhError("managed_comment_mismatch");
				if (row.kind === "notice") await db.inbox.markDone(row.id, now$1());
				return {
					ok: true,
					remoteId: receipt.remoteId
				};
			}
			if (row.nextRetryAt && row.nextRetryAt > now$1()) return {
				ok: false,
				reason: "retry_pending"
			};
			for (const previous of await db.inbox.listOutgoing()) {
				if (previous.id === row.id || previous.seq >= row.seq || previous.ticketId !== row.ticketId || previous.status === "done") continue;
				if ((previous.threadId ?? (previous.triggerId ? (await db.trigger.findById(previous.triggerId))?.threadId : void 0)) === thread.id && !await this.state(target.repository, `comment:${previous.id}`)) return {
					ok: false,
					reason: "earlier_delivery_pending"
				};
			}
			const root = `repos/${target.repository}/issues/${target.number}/comments`;
			const existing = (await this.pages(root, signal)).filter((comment) => record$1(comment.user).id != null && identity$1(record$1(comment.user).id) === environment.providerId && typeof comment.body === "string" && comment.body.includes(marker));
			if (existing.length > 1) throw new GhError("ambiguous_delivery");
			let remote = existing[0];
			if (!remote) {
				if (row.status === "stalled" || row.deliveryError === "publishing") {
					await db.inbox.markStalled(row.id, "transport_unknown");
					return {
						ok: false,
						reason: "transport_unknown"
					};
				}
				const current = await db.inbox.findById(row.id);
				if (!current || current.status !== "pending" || current.type !== row.type || current.kind !== row.kind) return {
					ok: false,
					reason: "delivery_superseded"
				};
				await this.destination(current);
				await db.inbox.recordDeliveryFailure(row.id, "publishing", now$1());
				posting = true;
				const body = row.kind === "ask" ? `${row.message}\n\n问题编号：${row.id}\n请回复：answer ${row.id}: 你的回答` : row.message;
				remote = record$1(await this.request(root, signal, "POST", { body: `${body}\n\n${marker}` }));
			}
			if (identity$1(record$1(remote.user).id) !== environment.providerId || !text$1(remote.body).includes(marker)) throw new GhError("managed_comment_mismatch");
			const remoteTarget = parseResource$1(text$1(remote.html_url));
			if (remoteTarget.repository !== target.repository || remoteTarget.number !== target.number) throw new GhError("managed_comment_mismatch");
			const result = {
				remoteId: identity$1(remote.id),
				providerId: environment.providerId,
				marker,
				url: text$1(remote.html_url)
			};
			await this.save(target.repository, `comment:${row.id}`, result);
			await db.inbox.resetDelivery(row.id);
			if (row.kind === "notice") await db.inbox.markDone(row.id, now$1());
			return {
				ok: true,
				remoteId: result.remoteId
			};
		} catch (error) {
			const reason = failure$1(error);
			if (posting && ![
				"rate_limited",
				"forbidden",
				"not_found",
				"not_logged_in",
				"remote_rejected"
			].includes(reason)) await db.inbox.markStalled(row.id, "transport_unknown");
			else if (![
				"human_paused",
				"project_disabled",
				"channel_disabled",
				"retry_pending"
			].includes(reason)) {
				row = await db.inbox.findById(row.id);
				const settings = await setting.load();
				const attempts = row.deliveryAttempts + (posting ? 0 : 1);
				if (attempts >= settings.deliveryMaxAttempts) await db.inbox.markStalled(row.id, reason);
				else {
					const seconds = Math.max(error instanceof GhError ? error.retryAfterSeconds ?? 0 : 0, Math.min(settings.deliveryRetryCeilingSeconds, 2 ** Math.max(1, attempts)));
					const nextRetryAt = new Date(Date.now() + seconds * 1e3).toISOString();
					if (posting) await db.inbox.update(row.id, {
						deliveryError: reason,
						nextRetryAt
					});
					else await db.inbox.recordDeliveryFailure(row.id, reason, nextRetryAt);
				}
			}
			if (signal?.aborted) throw error;
			return {
				ok: false,
				reason: posting && reason === "interrupted" ? "transport_unknown" : reason
			};
		}
	}
	async flush(signal) {
		signal?.throwIfAborted();
		if (!(await db.channel.findById("github"))?.enabled) return [];
		const results = [];
		for (const row of await db.inbox.listOutgoing()) {
			signal?.throwIfAborted();
			if (row.status !== "pending") continue;
			const trigger = row.triggerId && await db.trigger.findById(row.triggerId);
			if (trigger && trigger.channelId === "github") results.push({
				id: row.id,
				...await this.publish(row.id, signal)
			});
		}
		return results;
	}
};
const github = new GitHubChannel();
function repositoryOf(remoteUrl) {
	if (!remoteUrl) return null;
	const ssh = /^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(remoteUrl);
	if (ssh) return ssh[1].toLowerCase();
	try {
		const url = new URL(remoteUrl);
		if (!["https:", "ssh:"].includes(url.protocol) || url.hostname !== "github.com" || url.password || url.search || url.hash || url.port) return null;
		return /^\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
	} catch {
		return null;
	}
}
function parseResource$1(resource) {
	const short = /^github:([^/:]+\/[^/:]+):(issue|pull):([1-9]\d*)$/.exec(resource);
	if (short) return {
		repository: short[1].toLowerCase(),
		kind: short[2],
		number: Number(short[3])
	};
	let url;
	try {
		url = new URL(resource);
	} catch {
		throw new GhError("invalid_resource");
	}
	const match = /^\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/([1-9]\d*)\/?$/i.exec(url.pathname);
	if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || !match) throw new GhError("invalid_resource");
	return {
		repository: match[1].toLowerCase(),
		kind: match[2] === "pull" ? "pull" : "issue",
		number: Number(match[3])
	};
}
function validateTopic$1(row, target) {
	const url = parseResource$1(text$1(row.html_url));
	if (number$1(row.number) !== target.number || url.repository !== target.repository || url.kind !== target.kind) throw new GhError("source_repository_mismatch");
}
function item$1(row, kind) {
	return {
		id: identity$1(row.id),
		kind,
		actor: text$1(record$1(row.user).login),
		body: typeof row.body === "string" ? row.body : typeof row.state === "string" ? row.state : "",
		url: text$1(row.html_url),
		createdAt: timestamp$1(row.created_at ?? row.submitted_at),
		updatedAt: timestamp$1(row.updated_at ?? row.submitted_at ?? row.created_at)
	};
}
function record$1(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new GhError("invalid_response");
	return value;
}
function array$1(value) {
	if (!Array.isArray(value)) throw new GhError("invalid_response");
	return value;
}
function text$1(value) {
	if (typeof value !== "string" || !value) throw new GhError("invalid_response");
	return value;
}
function number$1(value) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new GhError("invalid_response");
	return value;
}
function identity$1(value) {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
	if (typeof value === "string" && value) return value;
	throw new GhError("invalid_response");
}
function timestamp$1(value) {
	const date = new Date(text$1(value));
	if (!Number.isFinite(date.getTime())) throw new GhError("invalid_response");
	return date.toISOString();
}
function now$1() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function digest$1(value) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function failure$1(error) {
	return error instanceof GhError ? error.code : error instanceof Error && error.name === "AbortError" ? "interrupted" : "transport_unknown";
}
function escapeRegex$1(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// src/channel/gitlab/runner.ts
var GitLabError = class extends Error {
	code;
	retryAfterSeconds;
	constructor(code, retryAfterSeconds) {
		super(code);
		this.code = code;
		this.retryAfterSeconds = retryAfterSeconds;
	}
};
var FetchGitLabRunner = class {
	async request(request) {
		if (request.signal?.aborted) throw new GitLabError("interrupted");
		const configured = await channel.connection("gitlab");
		if (!configured?.enabled) throw new GitLabError("channel_disabled");
		const site = gitlabSite(configured.host);
		if (request.site !== site || !/^(?:user$|projects(?:\/|$))/.test(request.path) || request.path.includes("\\") || request.path.includes("#") || /[\r\n]/.test(request.path)) throw new GitLabError("scope_denied");
		const url = new URL(`${site}/api/v4/${request.path}`);
		if (url.origin !== site || !url.pathname.startsWith("/api/v4/")) throw new GitLabError("scope_denied");
		const token = configured.token;
		if (!token?.trim()) throw new GitLabError("not_logged_in");
		if (request.signal?.aborted) throw new GitLabError("interrupted");
		const env = await channelProxyEnvironment(url, process.env);
		const dispatcher = await createRouteDispatcher({ get: (name) => env[name] === void 0 ? void 0 : { value: env[name] } }, { allowH2: false });
		try {
			let response;
			try {
				response = await fetch(url.href, {
					dispatcher,
					method: request.method,
					headers: {
						authorization: `Bearer ${token}`,
						accept: "application/json",
						...request.body ? { "content-type": "application/json" } : {}
					},
					...request.body ? { body: JSON.stringify(request.body) } : {},
					redirect: "error",
					signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(3e4)]) : AbortSignal.timeout(3e4)
				});
			} catch {
				throw new GitLabError(request.signal?.aborted ? "interrupted" : "transport_unknown");
			}
			if (!response.ok) {
				await response.body?.cancel();
				const retry = response.headers.get("retry-after");
				const retryAfter = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1e3)) : void 0;
				throw new GitLabError(response.status === 401 ? "not_logged_in" : response.status === 429 ? "rate_limited" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status >= 400 && response.status < 500 ? "remote_rejected" : "transport_unknown", Number.isFinite(retryAfter) ? retryAfter : void 0);
			}
			try {
				return await response.json();
			} catch {
				throw new GitLabError("invalid_response");
			}
		} finally {
			await dispatcher.close();
		}
	}
};
function gitlabSite(host) {
	let url;
	try {
		url = new URL(host ?? "https://gitlab.com");
	} catch {
		throw new GitLabError("invalid_channel_host");
	}
	if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new GitLabError("invalid_channel_host");
	return url.origin;
}
// src/channel/gitlab/channel.ts
var GitLabChannel = class {
	runner;
	operations = /* @__PURE__ */ new Map();
	publishing = /* @__PURE__ */ new Map();
	constructor(runner = new FetchGitLabRunner()) {
		this.runner = runner;
	}
	exclusive(key, action) {
		const current = this.operations.get(key);
		if (current) return current;
		const task = action().finally(() => this.operations.delete(key));
		this.operations.set(key, task);
		return task;
	}
	async site() {
		return gitlabSite((await db.channel.findById("gitlab"))?.host ?? null);
	}
	async canonicalResource(resource) {
		return resourceUrl(parseResource(resource, await this.site()));
	}
	async canRead(resource) {
		try {
			await this.canonicalResource(resource);
			return true;
		} catch {
			return false;
		}
	}
	async request(site, path, signal, method = "GET", body) {
		signal?.throwIfAborted();
		return this.runner.request({
			site,
			path,
			method,
			body,
			signal
		});
	}
	async state(repository, name) {
		const row = await db.sourceState.find("gitlab", `${repository}:${name}`);
		return row ? JSON.parse(row.value) : void 0;
	}
	async save(repository, name, value) {
		await db.sourceState.set("gitlab", `${repository}:${name}`, JSON.stringify(value), now());
	}
	async project(projectId) {
		const project$1 = (await project.list()).find((project) => project.id === projectId);
		if (!project$1 || !remoteGitlab(project$1.remoteUrl, await this.site())) throw new GitLabError("unknown_repository");
		if (!project$1.enabled) throw new GitLabError("project_disabled");
		if (project$1.available === false) throw new GitLabError("project_unavailable");
		return project$1;
	}
	async projectForRepository(repository) {
		const site = await this.site();
		const matches = (await project.list()).filter((project) => {
			const remote = remoteGitlab(project.remoteUrl, site);
			return remote && source(remote) === repository && project.available !== false;
		});
		if (matches.length !== 1) throw new GitLabError(matches.length ? "ambiguous_repository" : "unknown_repository");
		return matches[0];
	}
	async verifyEnvironment(projectId, signal) {
		const project = await this.project(projectId);
		const channel = await db.channel.findById("gitlab");
		if (!channel?.enabled) throw new GitLabError("channel_disabled");
		const site = gitlabSite(channel.host);
		const target = remoteGitlab(project.remoteUrl, site);
		const bots = (await db.channelAccount.findByRole("gitlab", "bot")).filter((account) => account.status === "online");
		const account = record(await this.request(site, "user", signal));
		const providerId = identity(account.id);
		const login = text(account.username);
		if (!bots.some((bot) => bot.name.toLowerCase() === login.toLowerCase()) || account.state !== void 0 && account.state !== "active") throw new GitLabError("account_mismatch");
		const remote = record(await this.request(site, `projects/${encodeURIComponent(target.repository)}`, signal));
		if (text(remote.path_with_namespace) !== target.repository || source(remoteGitlab(text(remote.web_url), site) ?? {
			site: "",
			repository: ""
		}) !== source(target)) throw new GitLabError("repository_mismatch");
		const result = {
			providerId,
			login,
			repositoryId: identity(remote.id)
		};
		const previous = await this.state(source(target), "verified_environment");
		if (previous && (previous.providerId !== providerId || previous.repositoryId !== result.repositoryId)) throw new GitLabError("environment_identity_changed");
		await this.save(source(target), "verified_environment", result);
		return result;
	}
	async pages(site, path, signal) {
		const result = [];
		for (let page = 1;; page++) {
			const batch = array(await this.request(site, `${path + (path.includes("?") ? "&" : "?")}per_page=100&page=${page}`, signal)).map(record);
			result.push(...batch);
			if (batch.length < 100) return result;
		}
	}
	async read(resource, offset = 0, limit = 50, signal) {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GitLabError("invalid_pagination");
		const target = parseResource(resource, await this.site());
		const project = await this.projectForRepository(source(target));
		await this.verifyEnvironment(project.id, signal);
		const main = record(await this.request(target.site, apiRoot(target), signal));
		validateTopic(main, target);
		const notes = await this.pages(target.site, `${apiRoot(target)}/notes?sort=asc&order_by=updated_at`, signal);
		const items = [item(main, target.kind, target), ...notes.map((row) => item(row, "comment", target)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))];
		return {
			items: items.slice(offset, offset + limit),
			next_offset: offset + limit < items.length ? offset + limit : null,
			next_resource: null
		};
	}
	async collectAll(signal) {
		signal?.throwIfAborted();
		if (!(await db.channel.findById("gitlab"))?.enabled) return [];
		const site = await this.site();
		const results = [];
		for (const project$2 of await project.list()) {
			signal?.throwIfAborted();
			if (!project$2.enabled || project$2.available === false || !remoteGitlab(project$2.remoteUrl, site)) continue;
			results.push({
				projectId: project$2.id,
				...await this.collect(project$2.id, signal)
			});
		}
		return results;
	}
	async collect(projectId, signal) {
		return this.exclusive(`collect:${projectId}`, async () => {
			const errors = [];
			try {
				const project = await this.project(projectId);
				await this.verifyEnvironment(projectId, signal);
				const target = remoteGitlab(project.remoteUrl, await this.site());
				const repository = source(target);
				const baseline = await this.state(repository, "baseline") ?? now();
				await this.save(repository, "baseline", baseline);
				for (const kind of ["issue", "pull"]) try {
					await this.stream(repository, kind, target.site, `projects/${encodeURIComponent(target.repository)}/${kind === "issue" ? "issues" : "merge_requests"}?state=all&scope=all&order_by=updated_at&sort=asc`, async (row) => {
						const resource = {
							...target,
							kind,
							number: number(row.iid)
						};
						validateTopic(row, resource);
						const thread = await this.ensureThread(resource, row);
						await this.ingest(thread, row, row.state === "closed" || row.state === "merged" ? "close" : "open", baseline, kind);
					}, signal);
				} catch (error) {
					if (signal?.aborted) throw error;
					errors.push(failure(error));
				}
				for (const thread of await db.thread.listByChannel("gitlab")) {
					if (!thread.url || !["issue", "pull"].includes(thread.kind)) continue;
					try {
						const resource = parseResource(thread.url, target.site);
						if (source(resource) !== repository) continue;
						await this.stream(repository, `notes:${resource.kind}:${resource.number}`, target.site, `${apiRoot(resource)}/notes?sort=asc&order_by=updated_at`, async (row) => {
							validateNote(row, resource);
							await this.acceptAnswers(thread, row);
							await this.ingest(thread, row, "comment", baseline, "note");
						}, signal);
					} catch (error) {
						if (signal?.aborted) throw error;
						errors.push(failure(error));
					}
				}
			} catch (error) {
				if (signal?.aborted) throw error;
				errors.push(failure(error));
			}
			return errors.length ? {
				ok: false,
				reason: [...new Set(errors)].join(",")
			} : { ok: true };
		});
	}
	async stream(repository, name, site, path, accept, signal) {
		const cursor = await this.state(repository, `cursor:${name}`) ?? { since: "1970-01-01T00:00:00.000Z" };
		const startedAt = now();
		const rows = await this.pages(site, path, signal);
		const revisions = [];
		let firstError;
		for (const row of rows) {
			signal?.throwIfAborted();
			try {
				await accept(row);
			} catch (error) {
				if (signal?.aborted) throw error;
				firstError ??= error;
			}
			revisions.push(digest(row));
		}
		if (firstError) throw firstError;
		const signature = digest(revisions.sort());
		await this.save(repository, `cursor:${name}`, cursor.signature === signature && cursor.through ? { since: cursor.through } : {
			since: cursor.since,
			signature,
			through: startedAt
		});
	}
	async ensureThread(target, row) {
		const refId = `${source(target)}:${target.kind}:${target.number}`;
		const existing = await db.thread.findByRef("gitlab", refId);
		return db.thread.record({
			id: existing?.id ?? `gitlab:${refId}`,
			channelId: "gitlab",
			refId,
			kind: target.kind,
			title: text(row.title),
			url: text(row.web_url),
			createdAt: timestamp(row.created_at),
			updatedAt: timestamp(row.updated_at),
			projectId: null,
			triage: "pending",
			triagedAt: null
		});
	}
	async ingest(thread, row, kind, baseline, sourceKind) {
		const author = record(row.author);
		const actorName = text(author.username);
		const accounts = await db.channelAccount.findByChannel("gitlab");
		const bots = accounts.filter((account) => account.role === "bot");
		const human = author.bot !== true && row.system !== true && !bots.some((bot) => bot.name.toLowerCase() === actorName.toLowerCase());
		const body = typeof row.body === "string" ? row.body : typeof row.description === "string" ? row.description : typeof row.state === "string" ? row.state : "";
		const mentioned = bots.some((bot) => new RegExp(`(?:^|[^a-z0-9_@])@${escapeRegex(bot.name)}(?![a-z0-9_.-])`, "i").test(body));
		const at = timestamp(row.updated_at ?? row.created_at);
		const id = `${thread.id}:${sourceKind}:${identity(row.id)}:${digest({
			body,
			at,
			state: row.state
		}).slice(0, 16)}`;
		const url = sourceKind === "note" ? `${thread.url}#note_${identity(row.id)}` : text(row.web_url);
		await db.trigger.ingest({
			id,
			channelId: "gitlab",
			threadId: thread.id,
			kind,
			actorName,
			human: Number(human),
			mentioned: Number(mentioned),
			text: body,
			url,
			at,
			ref: typeof row.source_branch === "string" ? row.source_branch : null
		});
		const subscriptions = await db.ticketThread.listTicketIds(thread.id);
		const historical = timestamp(row.created_at) < baseline;
		const admin = accounts.some((account) => account.role === "admin" && account.name.toLowerCase() === actorName.toLowerCase());
		if (!human || historical && !subscriptions.length) return;
		if (!subscriptions.length && (!admin || kind !== "open" && !mentioned || thread.triage === "ignored" && !mentioned)) return;
		const targets = /* @__PURE__ */ new Map();
		for (const ticketId of subscriptions) {
			const ticket = await db.ticket.findById(ticketId);
			if (ticket && !["done", "cancelled"].includes(ticket.status)) targets.set(ticket.projectId, {
				projectId: ticket.projectId,
				ticketId
			});
		}
		if (!subscriptions.length) targets.set(thread.projectId ?? "main", {
			projectId: thread.triage === "claimed" ? thread.projectId : null,
			ticketId: null
		});
		for (const [key, target] of targets) await db.inbox.enqueue({
			id: `${id}:inbox:${key}`,
			type: target.projectId ? "project" : "main",
			origin: "channel",
			kind: "trigger",
			message: body,
			title: thread.title,
			projectId: target.projectId,
			ticketId: target.ticketId,
			triggerId: id,
			threadId: thread.id
		});
	}
	async acceptAnswers(thread, row) {
		const author = record(row.author);
		const login = text(author.username);
		const accounts = await db.channelAccount.findByChannel("gitlab");
		if (author.bot === true || row.system === true || accounts.some((account) => account.role === "bot" && account.name.toLowerCase() === login.toLowerCase()) || !accounts.some((account) => account.role === "admin" && account.name.toLowerCase() === login.toLowerCase())) return;
		const body = typeof row.body === "string" ? row.body : "";
		const answers = /* @__PURE__ */ new Map();
		const conflicts = /* @__PURE__ */ new Set();
		let fenced = false;
		for (const line of body.split(/\r?\n/)) {
			if (/^\s*~{3}|^\s*```/.test(line)) {
				fenced = !fenced;
				continue;
			}
			if (fenced) continue;
			if (!/^answer[ \t]/i.test(line)) continue;
			const content = line.slice(7).trim();
			const separator = content.indexOf(": ");
			if (separator < 1) continue;
			const id = content.slice(0, separator).trim();
			const answer = content.slice(separator + 2).trim();
			if (!answer || /\s/.test(id)) continue;
			if (answers.has(id) && answers.get(id) !== answer) conflicts.add(id);
			answers.set(id, answer);
		}
		for (const [id, answer] of answers) {
			if (conflicts.has(id)) continue;
			const ask = await db.inbox.findById(id);
			if (!ask || ask.kind !== "ask" || ask.type !== "user" || ask.status !== "pending" || timestamp(row.created_at ?? row.submitted_at) < ask.createdAt) continue;
			const trigger = ask.triggerId && await db.trigger.findById(ask.triggerId);
			if (!trigger || trigger.threadId !== thread.id || ask.threadId && ask.threadId !== thread.id) continue;
			const target = parseResource(thread.url, await this.site());
			if (!await this.state(source(target), `comment:${id}`)) continue;
			if (ask.ticketId) {
				const ticket = await db.ticket.findById(ask.ticketId);
				if (!ticket || ["done", "cancelled"].includes(ticket.status)) continue;
			}
			await db.inbox.answerByUser(id, answer, now());
		}
	}
	async publish(inboxId, signal) {
		return this.exclusive(`publish:${inboxId}`, async () => {
			const row = await db.inbox.findById(inboxId);
			const trigger = row?.triggerId ? await db.trigger.findById(row.triggerId) : void 0;
			const key = trigger ? trigger.threadId : inboxId;
			const task = (this.publishing.get(key) ?? Promise.resolve()).then(() => this.publishOne(inboxId, signal));
			const barrier = task.then(() => void 0, () => void 0);
			this.publishing.set(key, barrier);
			try {
				return await task;
			} finally {
				if (this.publishing.get(key) === barrier) this.publishing.delete(key);
			}
		});
	}
	async destination(row) {
		if (row.type !== "user" || !["notice", "ask"].includes(row.kind) || !row.triggerId) throw new GitLabError("invalid_delivery");
		const trigger = await db.trigger.findById(row.triggerId);
		const thread = trigger && await db.thread.findById(trigger.threadId);
		if (!thread?.url || thread.channelId !== "gitlab" || !["issue", "pull"].includes(thread.kind) || row.threadId && row.threadId !== thread.id) throw new GitLabError("no_reply_address");
		const target = parseResource(thread.url, await this.site());
		const project = await this.projectForRepository(source(target));
		if (!project) throw new GitLabError("unknown_repository");
		if (row.ticketId) {
			const ticket = await db.ticket.findById(row.ticketId);
			if (row.kind === "ask" && ticket && ["done", "cancelled"].includes(ticket.status)) throw new GitLabError("delivery_superseded");
			if (!ticket || ticket.projectId !== project.id) throw new GitLabError("scope_denied");
			if (ticket.paused) throw new GitLabError("human_paused");
			if (!(await db.ticketThread.listTicketIds(thread.id)).includes(ticket.id)) throw new GitLabError("unsubscribed_thread");
		}
		return {
			thread,
			target
		};
	}
	async publishOne(inboxId, signal) {
		let row = await db.inbox.findById(inboxId);
		if (!row) return {
			ok: false,
			reason: "unknown_delivery"
		};
		if (row.status === "done") return { ok: true };
		let posting = false;
		try {
			const { thread, target } = await this.destination(row);
			const project = await this.projectForRepository(source(target));
			const environment = await this.verifyEnvironment(project.id, signal);
			const marker = `<!-- nexus:${row.id} -->`;
			const receipt = await this.state(source(target), `comment:${row.id}`);
			if (receipt) {
				if (receipt.providerId !== environment.providerId || receipt.marker !== marker) throw new GitLabError("managed_comment_mismatch");
				if (row.kind === "notice") await db.inbox.markDone(row.id, now());
				return {
					ok: true,
					remoteId: receipt.remoteId
				};
			}
			if (row.nextRetryAt && row.nextRetryAt > now()) return {
				ok: false,
				reason: "retry_pending"
			};
			for (const previous of await db.inbox.listOutgoing()) {
				if (previous.id === row.id || previous.seq >= row.seq || previous.ticketId !== row.ticketId || previous.status === "done") continue;
				if ((previous.threadId ?? (previous.triggerId ? (await db.trigger.findById(previous.triggerId))?.threadId : void 0)) === thread.id && !await this.state(source(target), `comment:${previous.id}`)) return {
					ok: false,
					reason: "earlier_delivery_pending"
				};
			}
			const root = `${apiRoot(target)}/notes`;
			const existing = (await this.pages(target.site, root, signal)).filter((comment) => record(comment.author).id != null && identity(record(comment.author).id) === environment.providerId && typeof comment.body === "string" && comment.body.includes(marker));
			if (existing.length > 1) throw new GitLabError("ambiguous_delivery");
			let remote = existing[0];
			if (!remote) {
				if (row.status === "stalled" || row.deliveryError === "publishing") {
					await db.inbox.markStalled(row.id, "transport_unknown");
					return {
						ok: false,
						reason: "transport_unknown"
					};
				}
				const current = await db.inbox.findById(row.id);
				if (!current || current.status !== "pending" || current.type !== row.type || current.kind !== row.kind) return {
					ok: false,
					reason: "delivery_superseded"
				};
				await this.destination(current);
				await db.inbox.recordDeliveryFailure(row.id, "publishing", now());
				posting = true;
				const body = row.kind === "ask" ? `${row.message}\n\n问题编号：${row.id}\n请回复：answer ${row.id}: 你的回答` : row.message;
				remote = record(await this.request(target.site, root, signal, "POST", { body: `${body}\n\n${marker}` }));
			}
			if (identity(record(remote.author).id) !== environment.providerId || !text(remote.body).includes(marker)) throw new GitLabError("managed_comment_mismatch");
			validateNote(remote, target);
			const result = {
				remoteId: identity(remote.id),
				providerId: environment.providerId,
				marker,
				url: `${resourceUrl(target)}#note_${identity(remote.id)}`
			};
			await this.save(source(target), `comment:${row.id}`, result);
			await db.inbox.resetDelivery(row.id);
			if (row.kind === "notice") await db.inbox.markDone(row.id, now());
			return {
				ok: true,
				remoteId: result.remoteId
			};
		} catch (error) {
			const reason = failure(error);
			if (posting && ![
				"rate_limited",
				"forbidden",
				"not_found",
				"not_logged_in",
				"remote_rejected"
			].includes(reason)) await db.inbox.markStalled(row.id, "transport_unknown");
			else if (![
				"human_paused",
				"project_disabled",
				"project_unavailable",
				"channel_disabled",
				"retry_pending"
			].includes(reason)) {
				row = await db.inbox.findById(row.id);
				const settings = await setting.load();
				const attempts = row.deliveryAttempts + (posting ? 0 : 1);
				if (attempts >= settings.deliveryMaxAttempts) await db.inbox.markStalled(row.id, reason);
				else {
					const seconds = Math.max(error instanceof GitLabError ? error.retryAfterSeconds ?? 0 : 0, Math.min(settings.deliveryRetryCeilingSeconds, 2 ** Math.max(1, attempts)));
					const nextRetryAt = new Date(Date.now() + seconds * 1e3).toISOString();
					if (posting) await db.inbox.update(row.id, {
						deliveryError: reason,
						nextRetryAt
					});
					else await db.inbox.recordDeliveryFailure(row.id, reason, nextRetryAt);
				}
			}
			if (signal?.aborted) throw error;
			return {
				ok: false,
				reason: posting && reason === "interrupted" ? "transport_unknown" : reason
			};
		}
	}
	async flush(signal) {
		signal?.throwIfAborted();
		if (!(await db.channel.findById("gitlab"))?.enabled) return [];
		const results = [];
		for (const row of await db.inbox.listOutgoing()) {
			signal?.throwIfAborted();
			if (row.status !== "pending") continue;
			const trigger = row.triggerId && await db.trigger.findById(row.triggerId);
			if (trigger && trigger.channelId === "gitlab") results.push({
				id: row.id,
				...await this.publish(row.id, signal)
			});
		}
		return results;
	}
};
const gitlab = new GitLabChannel();
function remoteGitlab(remoteUrl, host) {
	if (!remoteUrl) return null;
	const site = gitlabSite(host);
	const configured = new URL(site);
	const scp = /^git@([^/:]+):(.+)$/.exec(remoteUrl);
	if (scp) {
		if (scp[1].toLowerCase() !== configured.hostname || configured.port) return null;
		const repository = repositoryPath(scp[2].replace(/\.git$/, ""));
		return repository ? {
			site,
			repository
		} : null;
	}
	try {
		const url = new URL(remoteUrl);
		if (!["https:", "ssh:"].includes(url.protocol) || url.hostname !== configured.hostname || url.password || url.search || url.hash || (url.protocol === "https:" ? url.origin !== site || Boolean(url.username) : Boolean(url.port) || Boolean(url.username && url.username !== "git"))) return null;
		const repository = repositoryPath(url.pathname.replace(/^\//, "").replace(/\/$/, "").replace(/\.git$/, ""));
		return repository ? {
			site,
			repository
		} : null;
	} catch {
		return null;
	}
}
function repositoryPath(value) {
	const segments = value.split("/");
	return segments.length >= 2 && segments.every((segment) => /^\w[\w.-]*$/.test(segment) && segment !== "." && segment !== "..") ? value : null;
}
function parseResource(resource, site) {
	const short = /^gitlab:([^:]+):(issue|pull|mr):([1-9]\d*)$/.exec(resource);
	if (short) {
		const repository = repositoryPath(short[1]);
		const number = Number(short[3]);
		if (repository && Number.isSafeInteger(number)) return {
			site,
			repository,
			kind: short[2] === "issue" ? "issue" : "pull",
			number
		};
		throw new GitLabError("invalid_resource");
	}
	let url;
	try {
		url = new URL(resource.startsWith("gitlab/") ? `${site}/${resource.slice(7)}` : resource);
	} catch {
		throw new GitLabError("invalid_resource");
	}
	const match = /^\/(.+)\/-\/(issues|merge_requests)\/([1-9]\d*)\/?$/.exec(url.pathname);
	const repository = match && repositoryPath(match[1]);
	const number = Number(match?.[3]);
	if (url.origin !== site || url.protocol !== "https:" || url.username || url.password || url.search || url.hash && !/^#note_[1-9]\d*$/.test(url.hash) || !repository || !Number.isSafeInteger(number)) throw new GitLabError("invalid_resource");
	return {
		site,
		repository,
		kind: match[2] === "issues" ? "issue" : "pull",
		number
	};
}
function source(target) {
	return `${target.site}/${target.repository}`;
}
function resourceUrl(target) {
	return `${source(target)}/-/${target.kind === "issue" ? "issues" : "merge_requests"}/${target.number}`;
}
function apiRoot(target) {
	return `projects/${encodeURIComponent(target.repository)}/${target.kind === "issue" ? "issues" : "merge_requests"}/${target.number}`;
}
function validateTopic(row, target) {
	const remote = parseResource(text(row.web_url), target.site);
	if (number(row.iid) !== target.number || resourceUrl(remote) !== resourceUrl(target)) throw new GitLabError("source_repository_mismatch");
}
function validateNote(row, target) {
	identity(row.id);
	if (row.noteable_iid !== void 0 && number(row.noteable_iid) !== target.number) throw new GitLabError("source_repository_mismatch");
	if (row.noteable_type !== void 0 && row.noteable_type !== (target.kind === "issue" ? "Issue" : "MergeRequest")) throw new GitLabError("source_repository_mismatch");
	if (row.web_url !== void 0 && resourceUrl(parseResource(text(row.web_url), target.site)) !== resourceUrl(target)) throw new GitLabError("source_repository_mismatch");
}
function item(row, kind, target) {
	if (kind === "comment") validateNote(row, target);
	return {
		id: identity(row.id),
		kind,
		actor: text(record(row.author).username),
		body: typeof row.body === "string" ? row.body : typeof row.description === "string" ? row.description : typeof row.state === "string" ? row.state : "",
		url: kind === "comment" ? `${resourceUrl(target)}#note_${identity(row.id)}` : text(row.web_url),
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at ?? row.created_at)
	};
}
function record(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new GitLabError("invalid_response");
	return value;
}
function array(value) {
	if (!Array.isArray(value)) throw new GitLabError("invalid_response");
	return value;
}
function text(value) {
	if (typeof value !== "string" || !value) throw new GitLabError("invalid_response");
	return value;
}
function number(value) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new GitLabError("invalid_response");
	return value;
}
function identity(value) {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
	if (typeof value === "string" && value) return value;
	throw new GitLabError("invalid_response");
}
function timestamp(value) {
	const date = new Date(text(value));
	if (!Number.isFinite(date.getTime())) throw new GitLabError("invalid_response");
	return date.toISOString();
}
function now() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function digest(value) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function failure(error) {
	return error instanceof GitLabError ? error.code : error instanceof Error && error.name === "AbortError" ? "interrupted" : "transport_unknown";
}
function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// src/ai/_shared/tools/channel.ts
const read_channel = defineTool({
	name: "read_channel",
	description: "读渠道原文，靠 resource 路径前缀分发。返回 { items, next_offset, next_resource }，两条翻页轴都要跟完。",
	parameters: {
		resource: {
			type: "string",
			required: true,
			description: "资源路径，前缀决定分发：github/…、gitlab/…、gitlab:<项目>:issue|pull:<编号>、渠道原文 URL、trigger/<id>、thread/<id>、ticket/<id>。"
		},
		offset: {
			type: "integer",
			description: "从上一次的 next_offset 续读；0 表示重读同一份快照的开头。"
		},
		limit: {
			type: "integer",
			description: "本次最多返回多少条；省略则用渠道默认值。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "本条资源的正文分片，末尾附 next_offset / next_resource。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		const offset = args.offset ?? 0;
		const limit = args.limit ?? 50;
		if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("offset 必须非负，limit 必须在 1–100");
		const resource = args.resource.startsWith("github/") ? `https://github.com/${args.resource.slice(7)}` : args.resource;
		const links = identity.role === "worker" && identity.ticketId ? await db.ticketThread.listByTicket(identity.ticketId) : [];
		const allowedThreads = new Set(links.map((link) => link.threadId));
		let items;
		let nextResource = null;
		if (resource.startsWith("trigger/")) {
			const trigger = await db.trigger.findById(resource.slice(8));
			if (!trigger) throw new Error("触发不存在");
			if (identity.role === "worker" && !allowedThreads.has(trigger.threadId)) throw new Error("Worker 只能读取本任务来源");
			items = [trigger];
		} else if (resource.startsWith("thread/")) {
			const thread = await db.thread.findById(resource.slice(7));
			if (!thread) throw new Error("话题不存在");
			if (identity.role === "worker" && !allowedThreads.has(thread.id)) throw new Error("Worker 只能读取本任务来源");
			items = [thread];
			nextResource = thread.kind !== "ci" ? thread.url : null;
		} else if (resource.startsWith("ticket/")) {
			const ticket = await db.ticket.findById(resource.slice(7));
			if (!ticket) throw new Error("工单不存在");
			if (identity.role === "worker" && ticket.id !== identity.ticketId) throw new Error("Worker 只能读取本任务来源");
			items = [ticket, ...(await db.ticketThread.listByTicket(ticket.id)).map((link) => ({ resource: `thread/${link.threadId}` }))];
		} else {
			const isGitHub = resource.startsWith("github:") || (() => {
				try {
					const url = new URL(resource);
					return url.origin === "https://github.com" && !url.username && !url.password;
				} catch {
					return false;
				}
			})();
			const isGitLab = !isGitHub && await gitlab.canRead(resource);
			if (!isGitHub && !isGitLab) throw new Error("不支持的渠道资源");
			const target = isGitLab ? await gitlab.canonicalResource(resource) : resource;
			if (identity.role === "worker") {
				const threads = await Promise.all(links.map((link) => db.thread.findById(link.threadId)));
				let allowed = false;
				for (const thread of threads) {
					if (!thread?.url || thread.channelId !== (isGitLab ? "gitlab" : "github") || identity.projectId && thread.projectId && thread.projectId !== identity.projectId) continue;
					if (isGitLab) {
						if (await gitlab.canRead(thread.url) && await gitlab.canonicalResource(thread.url) === target) allowed = true;
					} else if (canonicalGitHub(thread.url) === canonicalGitHub(resource)) allowed = true;
				}
				if (!allowed) throw new Error("Worker 只能读取本任务来源");
			}
			return JSON.stringify(isGitLab ? await gitlab.read(target, offset, limit) : await github.read(resource, offset, limit));
		}
		const page = items.slice(offset, offset + limit);
		return JSON.stringify({
			items: page,
			next_offset: offset + page.length < items.length ? offset + page.length : null,
			next_resource: nextResource
		});
	}
});
const reply_channel = defineTool({
	name: "reply_channel",
	description: "按触发在对应渠道发言。锚点是 triggerId，不用猜发到哪。排队成功不等于送达。",
	parameters: {
		triggerId: {
			type: "string",
			required: true,
			description: "要回复的那条触发 id；回复发到这条触发所在的渠道地址。"
		},
		text: {
			type: "string",
			required: true,
			description: "发言正文，像人话。渠道的上限由对应 skill 说明。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "入队结果，例如 queued 或具体状态。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		const trigger = await db.trigger.findById(args.triggerId);
		if (!trigger) throw new Error("触发不存在");
		const thread = await db.thread.findById(trigger.threadId);
		if (!thread || thread.kind === "ci" || !thread.url) throw new Error("该触发没有可回复地址");
		if (identity.role === "worker") {
			if (!identity.ticketId || !(await db.ticketThread.listByTicket(identity.ticketId)).some((row) => row.threadId === thread.id)) throw new Error("Worker 只能回复本任务来源");
			await db.ticket.requireOpen(identity.ticketId);
		}
		if (identity.role === "project" && thread.projectId !== identity.projectId) {
			if (!(await Promise.all((await db.ticketThread.listByThread(thread.id)).map((link) => db.ticket.findById(link.ticketId)))).some((ticket) => ticket?.projectId === identity.projectId)) throw new Error("触发不属于当前项目");
		}
		const ticketId = identity.ticketId ?? null;
		const row = await db.inbox.enqueue({
			type: "user",
			origin: identity.role,
			kind: "notice",
			projectId: identity.projectId ?? thread.projectId,
			supervisorId: identity.supervisorId ?? null,
			workerId: identity.workerId ?? null,
			triggerId: trigger.id,
			threadId: thread.id,
			ticketId,
			message: args.text
		});
		return JSON.stringify({
			id: row.id,
			status: "queued"
		});
	}
});
function canonicalGitHub(value) {
	const match = /^github:([^:]+):(issue|pull):([1-9]\d*)$/.exec(value);
	if (match) return `https://github.com/${match[1]}/${match[2] === "issue" ? "issues" : "pull"}/${match[3]}`;
	const url = new URL(value);
	return url.origin + url.pathname.replace(/\/$/, "");
}
// src/ai/_shared/tools/inbox.ts
const inbox_list = defineTool({
	name: "inbox_list",
	description: "读取当前角色未处理邮件和原渠道任务，包含 pending 和 stalled。读取标为已读但不会完成。",
	parameters: { detail: {
		type: "boolean",
		description: "true 返回完整上下文；默认返回摘要。"
	} },
	output: {
		schema: {
			type: "string",
			description: "当前角色未处理邮件。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const mailbox = await inbox.read(exec.agent?.session.id ?? "", true);
		return JSON.stringify(args.detail ? mailbox.messages : mailbox.messages.map((row) => ({
			id: row.id,
			kind: row.kind,
			summary: row.title ?? row.message.split("\n")[0].slice(0, 120)
		})));
	}
});
const read_mailbox = defineTool({
	name: "read_mailbox",
	description: "主动读取当前角色全部未处理邮件和来源上下文，标为已读；处理完后用 inbox_kill 标为 done，ask 必须用 answer 回答。",
	parameters: {},
	output: {
		schema: {
			type: "string",
			description: "完整角色邮箱。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (_args, exec) => JSON.stringify(await inbox.read(exec.agent?.session.id ?? ""))
});
const inbox_kill = defineTool({
	name: "inbox_kill",
	description: "将自己角色的邮件显式标为 done；未回答的 ask 不能跳过。",
	parameters: { ids: {
		type: "array",
		items: { type: "string" },
		required: true,
		description: "已处理邮件的 id。"
	} },
	output: {
		schema: {
			type: "string",
			description: "完成数量。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => String(await inbox.complete(exec.agent?.session.id ?? "", args.ids, true))
});
// src/ai/preset.ts
function definePreset(definition) {
	const { tools, ...preset } = definition;
	return {
		tools: tools ?? [],
		preset: {
			...preset,
			plugins: [preset.instruction && {
				id: "persona",
				name: "@deepseek-ai/dsh-persona",
				config: { prefix: preset.instruction }
			}, ...preset.plugins ?? []].filter(Boolean)
		}
	};
}
// src/ai/manager/tools/communicate.ts
const report$2 = defineTool({
	name: "report",
	description: "向上级报事实：状态 + 一句话摘要。发完继续，不等答复。",
	parameters: {
		state: {
			type: "string",
			enum: [
				"progress",
				"ready",
				"failed",
				"dropped"
			],
			required: true,
			description: "progress 在跑 / ready 干完了 / failed 失败了 / dropped 不用做了。"
		},
		summary: {
			type: "string",
			required: true,
			description: "一句话摘要。给机器和面板看，短。"
		},
		supervisorId: {
			type: "string",
			description: "本票在某个 Supervisor 下且进入终态时必须带，否则那边一直等。不带则报给主编排。"
		},
		ticketId: {
			type: "string",
			description: "只做溯源，写进 Inbox.ticketId，不参与路由。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "是否已投递。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
		if (args.ticketId) {
			const ticket = await db.ticket.findById(args.ticketId);
			if (!ticket || ticket.projectId !== identity.projectId) throw new Error("工单不属于当前项目");
		}
		if (args.supervisorId && !await db.supervisor.findById(args.supervisorId)) throw new Error("Supervisor 不存在");
		return JSON.stringify(await db.inbox.enqueue({
			type: args.supervisorId ? "supervisor" : "main",
			projectId: identity.projectId,
			supervisorId: args.supervisorId ?? null,
			origin: "project",
			kind: "ticket",
			ticketId: args.ticketId ?? null,
			title: args.state,
			message: args.summary
		}));
	}
});
const ask$2 = defineTool({
	name: "ask",
	description: "向上级提问。发完这条工作线停下，答案到了会被 prompt 回来；会话本身继续处理别的票。",
	parameters: {
		question: {
			type: "string",
			required: true,
			description: "要上级回答的问题，一句话说清。"
		},
		supervisorId: {
			type: "string",
			description: "本票在某个 Supervisor 下时，问题直接进它，不再绕主编排。"
		},
		ticketId: {
			type: "string",
			description: "只做溯源，写进 Inbox.ticketId，不参与路由。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "ask 的 id 与投递去向。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
		if (args.ticketId) await db.ticket.requireOpen(args.ticketId, identity.projectId);
		if (args.supervisorId && (await db.supervisor.findById(args.supervisorId))?.status !== "active") throw new Error("Supervisor 不存在或已关闭");
		return JSON.stringify(await db.inbox.enqueueAsk({
			type: args.supervisorId ? "supervisor" : "main",
			projectId: identity.projectId,
			supervisorId: args.supervisorId ?? null,
			origin: "project",
			kind: "ask",
			ticketId: args.ticketId ?? null,
			message: args.question
		}));
	}
});
const escalate = defineTool({
	name: "escalate",
	description: "把一条已有的 ask 原样上交：问题文本不改，就地改 type 换处理者。",
	parameters: { askId: {
		type: "string",
		required: true,
		description: "要上交的那条 ask 的 Inbox id。"
	} },
	output: {
		schema: {
			type: "string",
			description: "上交后的处理者。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
		return JSON.stringify(await db.inbox.escalateScoped(args.askId, {
			type: "project",
			projectId: identity.projectId
		}, (/* @__PURE__ */ new Date()).toISOString()));
	}
});
// src/ai/manager/tools/supervisor.ts
const supervisor_list$1 = defineTool({
	name: "supervisor_list",
	description: "看 Supervisor：本项目相关的给明细，其余只给数量。",
	parameters: { status: {
		type: "string",
		enum: ["active", "closed"],
		description: "只看在协调中的或已收工的；省略表示只看 active。"
	} },
	output: {
		schema: {
			type: "string",
			description: "本项目那一张展开全部字段；其他 Supervisor 只给条数。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
		const rows = await db.supervisor.listByStatus(args.status ?? "active");
		const result = [];
		let others = 0;
		for (const row of rows) {
			const tickets = await Promise.all((await db.supervisorTicket.listBySupervisor(row.id)).map((link) => db.ticket.findById(link.ticketId)));
			if (tickets.some((ticket) => ticket?.projectId === identity.projectId)) result.push({
				...row,
				tickets
			});
			else others++;
		}
		return JSON.stringify({
			supervisors: result,
			others
		});
	}
});
// src/service/worker.ts
const operations = /* @__PURE__ */ new Map();
const eventQueues = /* @__PURE__ */ new Map();
let stopped = false;
let observing = false;
const worker$1 = defineService({
	start() {
		if (operations.size || eventQueues.size) throw new Error("worker_busy");
		stopped = false;
		observing = true;
		return async () => {
			stopped = true;
			observing = false;
			while (operations.size || eventQueues.size) await Promise.allSettled([...operations.values(), ...eventQueues.values()]);
		};
	},
	reconcile() {
		return run("slots", async () => {
			const settings = await setting.load();
			let running = (await db.worker.listRunning()).length;
			for (const worker of await db.worker.listQueued()) {
				if (stopped || running >= settings.maxWorkers) break;
				const ticket = await db.ticket.findById(worker.ticketId);
				if (!ticket || ticket.status === "done" || ticket.status === "cancelled") {
					await db.worker.end(worker.id, "stopped", (/* @__PURE__ */ new Date()).toISOString());
					continue;
				}
				if (ticket.paused || ticket.prepareError) continue;
				if ((await db.inbox.listByTicket(ticket.id)).some((message) => message.kind === "ask" && message.status === "pending" && message.workerId === worker.id)) continue;
				const project = await db.project.findById(ticket.projectId);
				if (!project) {
					await db.ticket.setPrepareError(ticket.id, "project_not_found", (/* @__PURE__ */ new Date()).toISOString());
					continue;
				}
				if (!project.enabled) continue;
				let started = false;
				try {
					let branch = worker.branch;
					let directory = worker.worktree;
					if (branch && directory) await worktree.verify(project.directory, directory, branch);
					else {
						const created = await worktree.create(project.directory, ticket.id, branch ?? void 0);
						branch = created.branch;
						directory = created.worktree;
						await db.worker.update(worker.id, {
							branch,
							worktree: directory
						});
					}
					if (stopped) throw new Error("worker_stopped");
					const threads = await db.ticketThread.listByTicket(ticket.id);
					const prompt = [
						`${ticket.id}: ${ticket.title}`,
						ticket.description ?? "",
						"来源话题：",
						...threads.map((thread) => thread.threadId),
						worker.recoveryNote ?? ""
					].filter(Boolean).join(String.fromCharCode(10));
					await session.create("worker", {
						sessionId: worker.id,
						ticketId: ticket.id,
						projectId: project.id,
						directory,
						title: worker.title ?? ticket.title
					});
					if (stopped) throw new Error("worker_stopped");
					const now = (/* @__PURE__ */ new Date()).toISOString();
					await db.worker.start(worker.id, now);
					await db.ticket.start(ticket.id, now, now);
					running++;
					started = true;
					await session.send(worker.id, prompt, "queue", `nexus:worker:${worker.id}`);
					await db.ticket.setPrepareError(ticket.id, null, now);
				} catch (error) {
					await db.ticket.setPrepareError(ticket.id, error instanceof Error ? error.message : String(error), (/* @__PURE__ */ new Date()).toISOString());
					if (stopped) break;
					if (started) {
						await session.stop(worker.id);
						await db.worker.end(worker.id, "failed", (/* @__PURE__ */ new Date()).toISOString());
						await db.ticket.update(ticket.id, {
							status: "waiting",
							updatedAt: (/* @__PURE__ */ new Date()).toISOString()
						});
						running--;
					}
				}
			}
		});
	},
	reconcileBackground() {
		return run("background", async () => {
			const now = (/* @__PURE__ */ new Date()).toISOString();
			for (const worker of await db.worker.listRunning()) {
				if (stopped) break;
				if (!worker.backgroundUntil) continue;
				const activity = await session.activity(worker.id);
				const expired = worker.backgroundUntil <= now;
				if (!expired && (activity.running || activity.background || activity.queued)) continue;
				if (expired) await session.stop(worker.id);
				await finish(worker, expired ? "stopped" : void 0);
			}
		});
	},
	recover() {
		return run("recovery", async () => {
			for (const worker of await db.worker.listRunning()) {
				if (stopped) break;
				const ticket = await db.ticket.findById(worker.ticketId);
				if (!ticket) continue;
				if (ticket.status === "done" || ticket.status === "cancelled") {
					if (await session.resolve(worker.id)) await session.stop(worker.id);
					await db.worker.end(worker.id, "stopped", (/* @__PURE__ */ new Date()).toISOString());
					continue;
				}
				if (ticket.paused) continue;
				try {
					const project = await db.project.findById(ticket.projectId);
					if (project && !project.enabled) continue;
					if (!project || !worker.worktree || !worker.branch) throw new Error("worker_workspace_missing");
					await worktree.verify(project.directory, worker.worktree, worker.branch);
					if (!await session.resolve(worker.id)) throw new Error("worker_session_unavailable");
					const activity = await session.activity(worker.id);
					if (activity.background && !worker.backgroundUntil) {
						const settings = await setting.load();
						await db.worker.setBackgroundUntil(worker.id, new Date(Date.now() + Math.min(30, settings.backgroundLimitMinutes) * 6e4).toISOString());
					}
					if (activity.running || activity.background || activity.queued) continue;
					const note = "运行已恢复。先检查目录、git 历史与渠道的当前事实，再决定是否重做外部动作；不要重复开 PR 或发布评论。";
					await db.worker.setRecoveryNote(worker.id, note);
					if (!(await db.inbox.listByTicket(ticket.id)).some((message) => message.kind === "ask" && message.status === "pending" && message.workerId === worker.id)) await session.send(worker.id, note, "queue", `nexus:recovery:${randomUUID()}`);
				} catch (error) {
					if (stopped) break;
					const now = (/* @__PURE__ */ new Date()).toISOString();
					await db.ticket.setPrepareError(ticket.id, error instanceof Error ? error.message : String(error), now);
					await db.ticket.update(ticket.id, {
						status: "waiting",
						updatedAt: now
					});
					await db.worker.end(worker.id, "failed", now);
				}
			}
		});
	},
	observe(source, event) {
		if (!observing || stopped || event.type !== "turn/end") return Promise.resolve();
		const previous = eventQueues.get(source.id) ?? Promise.resolve();
		const action = () => stopped ? Promise.resolve() : run(`event:${source.id}:${event.seq}`, async () => {
			const identity = await session.resolve(source.id);
			if (!identity || identity.role !== "worker" || !identity.workerId) return;
			const current = await db.worker.findById(identity.workerId);
			if (!current || current.status !== "running") return;
			const activity = await session.activity(current.id);
			if (activity.background) {
				const settings = await setting.load();
				if (!current.backgroundUntil) await db.worker.setBackgroundUntil(current.id, new Date(Date.now() + Math.min(30, settings.backgroundLimitMinutes) * 6e4).toISOString());
				return;
			}
			if (activity.queued) return;
			await finish(current, event.data.reason.kind === "error" ? "failed" : event.data.reason.kind === "aborted" ? "stopped" : void 0);
		});
		const current = previous.then(action, action).finally(() => {
			if (eventQueues.get(source.id) === current) eventQueues.delete(source.id);
		});
		eventQueues.set(source.id, current);
		return current;
	}
});
function run(key, action) {
	if (stopped) return Promise.reject(/* @__PURE__ */ new Error("worker_stopped"));
	const current = operations.get(key);
	if (current) return current;
	const task = Promise.resolve().then(action).finally(() => operations.delete(key));
	operations.set(key, task);
	return task;
}
async function finish(current, reason) {
	const asks = (await db.inbox.listByTicket(current.ticketId)).filter((message) => message.kind === "ask" && message.workerId === current.id);
	if (!reason) {
		if (asks.some((message) => message.status === "pending")) return;
		const answered = asks.filter((message) => message.answer);
		if (answered.length) {
			const receipts = await session.receipts(current.id);
			if (answered.some((message) => !receipts.some((receipt) => receipt.requestId === `nexus:answer:${message.id}`))) return;
		}
	}
	if (stopped) return;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	await db.worker.setBackgroundUntil(current.id, null);
	await db.worker.end(current.id, reason ?? (current.reportState === "failed" ? "failed" : "completed"), now);
	const ticket = await db.ticket.findById(current.ticketId);
	if (ticket && ticket.status !== "done" && ticket.status !== "cancelled") await db.ticket.update(ticket.id, {
		status: !reason && current.reportState === "ready" ? "review" : "waiting",
		updatedAt: now
	});
}
// src/ai/manager/index.ts
const manager = definePreset({
	id: "manager",
	name: "项目编排",
	description: "一个仓库一个：派 Worker、看汇报、收尾，任务走到哪一步由它推。不写代码。",
	instruction: `你是某个仓库的项目编排。长驻，管这个仓库下所有任务。

当前工作目录就是这个仓库的克隆。你不需要克隆、切换分支或提交 —— 那些是 Worker 的事。

## 你管三件事

**派活。** 一张票该开跑时，create_worker。建 worktree、开分支、起会话一次性配好。
槽位满了就让它留在 queued，不要硬开 —— 硬开的后果是两个 Worker 抢同一个端口。

**看着。** Worker 的汇报会进你的收件箱。ready 说明能审了，failed 说明要重试，
dropped 说明这活不用做了。收工的时候留下 branch 和 worktree，那是唯一记录。

**收尾。** PR 合了、CI 绿了、人说行了，就把票推到 done。
合并和关闭**不会**产生新触发 —— 别等它，自己去看。

## 分支命名

\`nexus/<任务号>\`，例如 \`nexus/T-105\`。**末段必须是任务号**，
PR 归哪张票就是靠这个字符串比对，猜错就挂到别的票上了。

## 收件箱

每条消息处理完就 inbox_kill 掉，别留着。会话结束时会提示「你有 N 条消息未处理」，
那时候还有 pending 就是没干完。

消息的优先级：**ask 排最前**，因为提问方那条线停着。其余按到达顺序。

## 求助

Worker 问你的事，能自己答的就 answer。不该你决定的两条路：

- 问主编排 → escalate，问题原文不动，只换回答的人
- 问人 → 你没有 ask，只能 escalate 上去让主编排问

不要替人做决定。不要给一个「大概是这样」的答案让 Worker 去猜。

## 边界

**不写代码。** 你觉得改动只有两行、自己动手更快 —— 也不动手。
自己改的话没人 review，也没人知道改过。

**不跨项目。** 你的视野就是这个仓库。需要别的项目配合，报给主编排。

**不取消票。** 取消是人的决定。做不了就报 failed，让人看见。`,
	order: 5,
	tools: [
		read_channel,
		reply_channel,
		read_mailbox,
		inbox_list,
		inbox_kill,
		report$2,
		ask$2,
		escalate,
		supervisor_list$1,
		defineTool({
			name: "list_ticket",
			description: "列本项目的任务。判重时必看。",
			parameters: {
				status: {
					type: "string",
					enum: [
						"waiting",
						"queued",
						"running",
						"review",
						"done",
						"cancelled"
					],
					description: "只看某个状态；省略表示不含已终态的票。"
				},
				attentionOnly: {
					type: "boolean",
					description: "true 时只返回存在指向它的 pending ask 的票。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "本项目任务列表：id、标题、状态、PR 状态、有无 pending ask。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (!identity) throw new Error("当前会话没有 Nexus 身份");
				if (identity.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				return JSON.stringify(await db.ticket.listFiltered({
					...args,
					projectId: identity.projectId
				}));
			}
		}),
		defineTool({
			name: "link_ticket",
			description: "建一张工单到另一张工单的关联。限本项目；跨项目依赖由 Supervisor 的 link_dependency 记。",
			parameters: {
				ticketId: {
					type: "string",
					required: true,
					description: "发起关联的票，必须是本项目的。"
				},
				relatedId: {
					type: "string",
					required: true,
					description: "被指向的那张票。"
				},
				kind: {
					type: "string",
					enum: ["depends", "relates"],
					required: true,
					description: "depends 前置依赖：relatedId 没做完，ticketId 停在 waiting。relates 只是相关，谁都不等谁。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "关联结果。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const ticket = await db.ticket.requireOpen(args.ticketId, identity.projectId);
				const related = await db.ticket.findById(args.relatedId);
				if (!related || related.projectId !== identity.projectId) throw new Error("跨项目关联应由 Supervisor 处理");
				if (ticket.id === related.id) throw new Error("工单不能关联自己");
				await db.ticketLink.link(ticket.id, related.id, args.kind, (/* @__PURE__ */ new Date()).toISOString());
				if (args.kind === "depends" && related.status !== "done" && related.status !== "cancelled") await db.ticket.save(ticket.id, {
					status: "waiting",
					updatedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				return JSON.stringify({ linked: true });
			}
		}),
		defineTool({
			name: "stop_ticket",
			description: "按人的明确要求结单为 cancelled。必须绑一条 human=true 的触发 —— 停止是人的决定，不是编排的判断。",
			parameters: {
				ticketId: {
					type: "string",
					required: true,
					description: "要停的票。"
				},
				triggerId: {
					type: "string",
					required: true,
					description: "人说停的那条触发。必须是 human=true，否则拒绝。"
				},
				reason: {
					type: "string",
					description: "一句话说明为什么停，写进记录。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "结单结果。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const ticket = await db.ticket.requireOpen(args.ticketId, identity.projectId);
				const trigger = await db.trigger.findById(args.triggerId);
				if (!trigger || trigger.human !== 1) throw new Error("停止工单必须绑定 human=true 的触发");
				if (!(await db.ticketThread.listByTicket(ticket.id)).some((row) => row.threadId === trigger.threadId)) throw new Error("停止触发不属于当前工单来源");
				for (const worker of await db.worker.listByTicket(ticket.id)) {
					if (worker.status === "ended") continue;
					if (worker.status === "running") await session.cancel(worker.id);
					await db.worker.end(worker.id, "stopped", (/* @__PURE__ */ new Date()).toISOString());
				}
				const now = (/* @__PURE__ */ new Date()).toISOString();
				await db.ticket.finish(ticket.id, "cancelled", now, now);
				await db.inbox.returnPendingTicket(ticket.id, args.reason ?? "人类要求停止", now);
				for (const link of await db.supervisorTicket.listByTicket(ticket.id)) await db.inbox.enqueue({
					type: "supervisor",
					supervisorId: link.supervisorId,
					projectId: ticket.projectId,
					origin: "project",
					kind: "ticket",
					ticketId: ticket.id,
					title: "dropped",
					message: args.reason ?? "人类要求停止"
				});
				return JSON.stringify({
					id: ticket.id,
					status: "cancelled"
				});
			}
		}),
		defineTool({
			name: "retry_ticket",
			description: "重开卡住的票：结束旧 Worker，开一个新的。只对还开着、卡在 failed 的票有效。",
			parameters: { ticketId: {
				type: "string",
				required: true,
				description: "要重开的票。已到终态的票不适用 —— 那张只能由插件在人类消息到达时复活。"
			} },
			output: {
				schema: {
					type: "string",
					description: "重开结果。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const ticket = await db.ticket.requireOpen(args.ticketId, identity.projectId);
				const old = (await db.worker.listByTicket(ticket.id)).at(-1);
				if (!old || old.reportState !== "failed") throw new Error("只允许重试 failed Worker");
				if (old.status === "running") await session.cancel(old.id);
				await db.worker.end(old.id, "restarted", (/* @__PURE__ */ new Date()).toISOString());
				const worker = await db.worker.queue(ticket.id, identity.projectId, old.branch ?? void 0);
				if (old.branch && old.worktree) await db.worker.update(worker.id, {
					branch: old.branch,
					worktree: old.worktree
				});
				await db.ticket.setPrepareError(ticket.id, null, (/* @__PURE__ */ new Date()).toISOString());
				await worker$1.reconcile();
				return JSON.stringify(await db.worker.findById(worker.id));
			}
		}),
		defineTool({
			name: "create_worker",
			description: "给一张票开 Worker：建 worktree、切分支、起会话一次配好。并发满了就让它留在 queued。",
			parameters: {
				ticketId: {
					type: "string",
					required: true,
					description: "要开跑的票，必须是本项目的。"
				},
				branch: {
					type: "string",
					description: "分支名，省略则用 nexus/<任务号>。末段必须是任务号，PR 归哪张票就靠这个字符串比对。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "新 Worker 的 id、分支与 worktree 路径。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const worker = await db.worker.queue(args.ticketId, identity.projectId, args.branch);
				await worker$1.reconcile();
				return JSON.stringify(await db.worker.findById(worker.id));
			}
		}),
		defineTool({
			name: "send",
			description: "直接将完整消息交给活跃 Worker，跳过业务排队；只有需要立刻止损才用 interrupt。Worker 没有收件箱。",
			parameters: {
				workerId: {
					type: "string",
					required: true,
					description: "目标 Worker。"
				},
				text: {
					type: "string",
					required: true,
					description: "要说的话。"
				},
				mode: {
					type: "string",
					enum: [
						"queue",
						"interrupt",
						"reply"
					],
					required: true,
					description: "queue 也直接 steer 到最近一步；interrupt 中止当前回合再 steer；reply 回答它的 ask 并直接 steer。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "投递结果。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const worker = await db.worker.findById(args.workerId);
				if (!worker) throw new Error("Worker 不存在");
				const ticket = await db.ticket.findById(worker.ticketId);
				if (!ticket || ticket.projectId !== identity.projectId) throw new Error("Worker 不属于当前项目");
				if (worker.status === "ended") throw new Error("Worker 已结束");
				if (ticket.status === "done" || ticket.status === "cancelled") throw new Error("工单已结束");
				if (!await session.lookup(worker.id)) throw new Error("Worker 未在运行时加载、已归档或不属于 Nexus；不能直接发送");
				if (args.mode === "reply") {
					const asks = (await db.inbox.listByTicket(ticket.id)).filter((row) => row.workerId === worker.id && row.kind === "ask" && row.status === "pending");
					if (asks.length !== 1 || !db.inbox.owns(asks[0], {
						type: "project",
						projectId: identity.projectId
					})) throw new Error("reply 必须唯一对应当前项目编排待答的 ask");
					await db.inbox.answerScoped(asks[0].id, args.text, {
						type: "project",
						projectId: identity.projectId
					}, (/* @__PURE__ */ new Date()).toISOString());
					await session.send(worker.id, `[Answer ${asks[0].id}] ${args.text}`, "reply", `nexus:answer:${asks[0].id}`);
				} else await session.send(worker.id, args.text, args.mode);
				return JSON.stringify({
					sent: true,
					mode: args.mode
				});
			}
		}),
		defineTool({
			name: "view",
			description: "读 Worker 会话正文，分片返回。这不是 report —— report 是结构化状态通道。",
			parameters: {
				workerId: {
					type: "string",
					required: true,
					description: "要读的 Worker。"
				},
				offset: {
					type: "integer",
					description: "从上次的 next_offset 续读；0 表示从头读。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "会话正文分片，末尾附 next_offset。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const worker = await db.worker.findById(args.workerId);
				if (!worker || (await db.ticket.findById(worker.ticketId))?.projectId !== identity.projectId) throw new Error("Worker 不属于当前项目");
				if (args.offset !== void 0 && (!Number.isInteger(args.offset) || args.offset < 0)) throw new Error("offset 必须是非负整数");
				return JSON.stringify(await session.view(worker.id, args.offset));
			}
		}),
		defineTool({
			name: "cancel",
			description: "中止 Worker 当前回合。那一次回合一并作废。",
			parameters: {
				workerId: {
					type: "string",
					required: true,
					description: "要中止的 Worker。"
				},
				keepInbox: {
					type: "boolean",
					description: "true 保留官方 Agent 尚未接收的输入；省略则清除。不涉及业务收件箱。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "中止结果。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const worker = await db.worker.findById(args.workerId);
				if (!worker) throw new Error("Worker 不存在");
				const ticket = await db.ticket.findById(worker.ticketId);
				if (!ticket || ticket.projectId !== identity.projectId) throw new Error("Worker 不属于当前项目");
				if (worker.status === "ended") throw new Error("Worker 已结束");
				await session.cancel(worker.id, args.keepInbox);
				return JSON.stringify({ cancelled: true });
			}
		}),
		defineTool({
			name: "rename",
			description: "改 Worker 会话的标题，方便在会话列表里认出来。",
			parameters: {
				workerId: {
					type: "string",
					required: true,
					description: "要改名的 Worker。"
				},
				title: {
					type: "string",
					required: true,
					description: "新标题。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "改名结果。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (identity?.role !== "project" || !identity.projectId) throw new Error("仅项目编排可调用");
				const worker = await db.worker.findById(args.workerId);
				if (!worker) throw new Error("Worker 不存在");
				const ticket = await db.ticket.findById(worker.ticketId);
				if (!ticket || ticket.projectId !== identity.projectId) throw new Error("Worker 不属于当前项目");
				if (worker.status === "ended") throw new Error("Worker 已结束");
				await session.rename(worker.id, args.title);
				await db.worker.update(worker.id, { title: args.title });
				return JSON.stringify({
					id: worker.id,
					title: args.title
				});
			}
		})
	],
	plugins: [
		agentInstructions,
		compaction,
		commandGoal,
		delegation,
		skillFilesystem,
		timeContext,
		toolBash,
		toolExecutorPtc,
		toolFs,
		toolFsSearch,
		toolJobs,
		toolPresent,
		toolPwsh,
		toolSkill,
		toolTodo,
		toolWeb
	]
});
// src/ai/_shared/tools/communicate.ts
const answer = defineTool({
	name: "answer",
	description: "回答下面升上来的 ask：填 answer，标 status=done，答案送回发起方。",
	parameters: {
		askId: {
			type: "string",
			required: true,
			description: "要回答的那条 ask 的 Inbox id。"
		},
		text: {
			type: "string",
			required: true,
			description: "答案正文。发起方会原样收到。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "是否已回送。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role === "worker") throw new Error("Worker 没有收件箱");
		const scope = identity.role === "project" && identity.projectId ? {
			type: "project",
			projectId: identity.projectId
		} : identity.role === "supervisor" && identity.supervisorId ? {
			type: "supervisor",
			supervisorId: identity.supervisorId
		} : identity.role === "main" ? { type: "main" } : null;
		if (!scope) throw new Error("会话身份不完整");
		const question = await db.inbox.findById(args.askId);
		if (question?.origin === "worker") {
			if (!question.workerId || !await session.lookup(question.workerId)) throw new Error("Worker 未在运行时加载、已归档或不属于 Nexus；不能直接回答");
			if ((await db.worker.findById(question.workerId))?.status === "ended") throw new Error("Worker 已结束");
		}
		const row = await db.inbox.answerScoped(args.askId, args.text, scope, (/* @__PURE__ */ new Date()).toISOString());
		if (row.origin === "worker" && row.workerId) await session.send(row.workerId, `[Answer ${row.id}] ${args.text}`, "reply", `nexus:answer:${row.id}`);
		return JSON.stringify({
			id: args.askId,
			status: "done",
			delivery: row.origin === "worker" ? "direct" : "queued"
		});
	}
});
// src/ai/_shared/tools/ticket.ts
const dispatch_ticket = defineTool({
	name: "dispatch_ticket",
	description: "把票派给它的项目编排：写一条 Inbox(type=project, kind=ticket)。",
	parameters: {
		ticketId: {
			type: "string",
			required: true,
			description: "要派下去的票。归属由票自己决定，不用另外传项目。"
		},
		message: {
			type: "string",
			description: "附带给该项目编排的话。派新票时可省；只是提醒或调整时，写清楚要它做什么 —— 只说场景和约束，不要附实现方案。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "派工结果。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main" && identity.role !== "supervisor") throw new Error("仅主编排或 Supervisor 可派票");
		const ticket = await db.ticket.requireOpen(args.ticketId);
		if (identity.role === "supervisor" && !(await db.supervisorTicket.listBySupervisor(identity.supervisorId)).some((row) => row.ticketId === ticket.id)) throw new Error("工单不属于当前 Supervisor");
		return JSON.stringify(await db.inbox.enqueue({
			type: "project",
			projectId: ticket.projectId,
			supervisorId: identity.supervisorId ?? null,
			origin: identity.role,
			kind: "ticket",
			ticketId: ticket.id,
			message: args.message ?? ticket.title
		}));
	}
});
const note_ticket = defineTool({
	name: "note_ticket",
	description: "把在别处得到的事实告诉这张票的项目编排：只传信息，不给授权，不改任何状态。",
	parameters: {
		ticketId: {
			type: "string",
			required: true,
			description: "要通知的票。消息进它所属项目编排的收件箱。"
		},
		text: {
			type: "string",
			required: true,
			description: "要说的事实，一句话，例如「A 把接口改成了 Y」。只说发生了什么，不要写成任务要求或实现建议。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "投递结果。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main" && identity.role !== "supervisor") throw new Error("仅主编排或 Supervisor 可通知项目");
		const ticket = await db.ticket.findById(args.ticketId);
		if (!ticket) throw new Error("工单不存在");
		if (identity.role === "supervisor" && !(await db.supervisorTicket.listBySupervisor(identity.supervisorId)).some((row) => row.ticketId === ticket.id)) throw new Error("工单不属于当前 Supervisor");
		return JSON.stringify(await db.inbox.enqueue({
			type: "project",
			projectId: ticket.projectId,
			supervisorId: identity.supervisorId ?? null,
			origin: identity.role,
			kind: "notice",
			ticketId: ticket.id,
			message: args.text
		}));
	}
});
// src/ai/orchestrator/tools/communicate.ts
const ask_user = defineTool({
	name: "ask_user",
	description: "问人。只有主编排能问 —— 它是唯一能触达人类的一层。",
	parameters: {
		question: {
			type: "string",
			required: true,
			description: "要人回答的问题。写成人类听得懂的一句话，不要带技术黑话。"
		},
		triggerId: {
			type: "string",
			description: "问题发到哪个渠道；给了就锚在这条触发上，省略则只留在面板里。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "ask 的 id 与投递去向。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const trigger = args.triggerId ? await db.trigger.findById(args.triggerId) : null;
		if (args.triggerId && !trigger) throw new Error("触发不存在");
		const thread = trigger ? await db.thread.findById(trigger.threadId) : null;
		if (trigger && (!thread || thread.kind === "ci" || !thread.url)) throw new Error("该触发没有可回复地址");
		const pending = (await db.inbox.listPendingAsk()).find((row) => row.origin === "main" && row.message === args.question && row.triggerId === (args.triggerId ?? null));
		if (pending) return JSON.stringify({
			id: pending.id,
			status: "pending",
			delivery: pending.triggerId ? "queued" : "panel"
		});
		const row = await db.inbox.enqueueAsk({
			type: "user",
			origin: "main",
			kind: "ask",
			triggerId: trigger?.id ?? null,
			threadId: thread?.id ?? null,
			projectId: thread?.projectId ?? null,
			message: args.question
		});
		return JSON.stringify({
			id: row.id,
			status: "pending",
			delivery: row.triggerId ? "queued" : "panel"
		});
	}
});
// src/ai/orchestrator/tools/supervisor.ts
const supervisor_list = defineTool({
	name: "supervisor_list",
	description: "列全部 Supervisor，字段完整：标题、原因、状态、关联工单、各自进度。",
	parameters: { status: {
		type: "string",
		enum: ["active", "closed"],
		description: "只看在协调中的或已收工的；省略表示只看 active。"
	} },
	output: {
		schema: {
			type: "string",
			description: "Supervisor 列表，含 title / reason / status / 关联工单。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const rows = await db.supervisor.listByStatus(args.status ?? "active");
		return JSON.stringify(await Promise.all(rows.map(async (row) => ({
			...row,
			tickets: await Promise.all((await db.supervisorTicket.listBySupervisor(row.id)).map((link) => db.ticket.findById(link.ticketId)))
		}))));
	}
});
const create_supervisor = defineTool({
	name: "create_supervisor",
	description: "跨项目时拉起一个临时协调者：建记录并起会话，把双方上下文写进开场。",
	parameters: {
		title: {
			type: "string",
			required: true,
			description: "一句话说明它在协调什么，例如「T-105 需要 B/x 配合」。"
		},
		reason: {
			type: "string",
			required: true,
			description: "为什么拉起来，写清卡在哪，方便事后回溯。"
		},
		ticketIds: {
			type: "array",
			items: { type: "string" },
			required: true,
			description: "它协调的那几张票，通常每个项目一张。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "新 Supervisor 的 id 与关联工单。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const ticketIds = [...new Set(args.ticketIds)];
		if (!ticketIds.length) throw new Error("至少需要一张工单");
		const tickets = await Promise.all(ticketIds.map((id) => db.ticket.requireOpen(id)));
		const id = randomUUID();
		const now = (/* @__PURE__ */ new Date()).toISOString();
		await db.supervisor.create({
			id,
			title: args.title,
			reason: args.reason,
			status: "active",
			sessionId: null,
			createdAt: now,
			closedAt: null
		});
		for (const ticketId of ticketIds) await db.supervisorTicket.link(id, ticketId, now);
		const sessionId = await session.create("supervisor", {
			supervisorId: id,
			title: args.title
		});
		await db.supervisor.attachSession(id, sessionId);
		await session.send(sessionId, JSON.stringify({
			title: args.title,
			reason: args.reason,
			tickets
		}), "queue");
		return JSON.stringify({
			id,
			sessionId,
			ticketIds
		});
	}
});
const close_supervisor = defineTool({
	name: "close_supervisor",
	description: "关掉 Supervisor：status=closed，关联工单退回各自项目编排。reason 会原样进每个持票项目编排的收件箱。",
	parameters: {
		supervisorId: {
			type: "string",
			required: true,
			description: "要关掉的 Supervisor。"
		},
		reason: {
			type: "string",
			required: true,
			description: "为什么关。会原样进每个关联工单所属项目编排的收件箱 —— 它们要凭这句话决定那几张票接下来怎么办。写清是「做完了」还是「不做了、各自收摊」。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "关闭结果，含通知到哪几个项目编排。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const row = await db.supervisor.findById(args.supervisorId);
		if (!row) throw new Error("Supervisor 不存在");
		if (row.status === "closed") return JSON.stringify({
			id: row.id,
			status: "closed",
			notified: []
		});
		const tickets = await Promise.all((await db.supervisorTicket.listBySupervisor(row.id)).map((link) => db.ticket.findById(link.ticketId)));
		const projects = [...new Set(tickets.flatMap((ticket) => ticket ? [ticket.projectId] : []))];
		for (const projectId of projects) await db.inbox.enqueue({
			id: `supervisor-close:${row.id}:${projectId}`,
			type: "project",
			projectId,
			supervisorId: row.id,
			origin: "main",
			kind: "notice",
			title: row.title,
			message: `${args.reason}\n${tickets.filter((ticket) => ticket?.projectId === projectId).map((ticket) => ticket.id).join(", ")}`
		});
		await db.supervisor.close(row.id, (/* @__PURE__ */ new Date()).toISOString());
		return JSON.stringify({
			id: row.id,
			status: "closed",
			notified: projects
		});
	}
});
const attach_tickets_to_supervisor = defineTool({
	name: "attach_tickets_to_supervisor",
	description: "扩大 Supervisor 的范围：加关联工单，并自动通知该项目编排。",
	parameters: {
		supervisorId: {
			type: "string",
			required: true,
			description: "要扩范围的 Supervisor。"
		},
		ticketIds: {
			type: "array",
			items: { type: "string" },
			required: true,
			description: "要加进去的票。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "扩范围结果。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const row = await db.supervisor.findById(args.supervisorId);
		if (!row || row.status !== "active") throw new Error("Supervisor 不存在或已关闭");
		const tickets = await Promise.all([...new Set(args.ticketIds)].map((id) => db.ticket.requireOpen(id)));
		const existing = await db.supervisorTicket.listBySupervisor(row.id);
		const added = tickets.filter((ticket) => !existing.some((link) => link.ticketId === ticket.id));
		for (const ticket of added) await db.supervisorTicket.link(row.id, ticket.id, (/* @__PURE__ */ new Date()).toISOString());
		for (const projectId of new Set(added.map((ticket) => ticket.projectId))) await db.inbox.enqueue({
			type: "project",
			projectId,
			supervisorId: row.id,
			origin: "main",
			kind: "notice",
			title: row.title,
			message: `加入 Supervisor ${row.id}: ${added.filter((ticket) => ticket.projectId === projectId).map((ticket) => ticket.id).join(", ")}`
		});
		return JSON.stringify({ attached: added.map((ticket) => ticket.id) });
	}
});
const detach_tickets_from_supervisor = defineTool({
	name: "detach_tickets_from_supervisor",
	description: "缩小 Supervisor 的范围：去掉关联工单，退回原项目，并自动通知该项目编排。**不取消** —— 取消是人的决定。",
	parameters: {
		supervisorId: {
			type: "string",
			required: true,
			description: "要缩范围的 Supervisor。"
		},
		ticketIds: {
			type: "array",
			items: { type: "string" },
			required: true,
			description: "要退回原项目的票。"
		},
		reason: {
			type: "string",
			required: true,
			description: "为什么摘出来。会进退回票所属项目编排的收件箱 —— 它要凭这句话知道那张票现在归谁管、还要不要继续等。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "缩范围结果，含通知到哪几个项目编排。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const row = await db.supervisor.findById(args.supervisorId);
		if (!row) throw new Error("Supervisor 不存在");
		const existing = await db.supervisorTicket.listBySupervisor(row.id);
		const ids = [...new Set(args.ticketIds)].filter((id) => existing.some((link) => link.ticketId === id));
		const tickets = await Promise.all(ids.map((id) => db.ticket.findById(id)));
		for (const ticketId of ids) await db.supervisorTicket.unlink(row.id, ticketId);
		for (const projectId of new Set(tickets.flatMap((ticket) => ticket ? [ticket.projectId] : []))) await db.inbox.enqueue({
			type: "project",
			projectId,
			supervisorId: row.id,
			origin: "main",
			kind: "notice",
			title: row.title,
			message: `${args.reason}\n${tickets.filter((ticket) => ticket?.projectId === projectId).map((ticket) => ticket.id).join(", ")}`
		});
		return JSON.stringify({ detached: ids });
	}
});
// src/ai/orchestrator/tools/thread.ts
const triage_thread = defineTool({
	name: "triage_thread",
	description: "给一条还没票跟着的话题定归属。判一次就固定，之后不再打扰主编排。",
	parameters: {
		threadId: {
			type: "string",
			required: true,
			description: "话题 id，形如 github:42 或 feishu:<chat>:<root>。"
		},
		action: {
			type: "string",
			enum: ["claim", "ignore"],
			required: true,
			description: "claim 归给某个项目；ignore 判为不用处理，之后不投递，除非有人又 @ 了我们。"
		},
		projectId: {
			type: "string",
			description: "action=claim 时必给：话题归哪个项目。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "写入后的 triage 结论。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const thread = await db.thread.findById(args.threadId);
		if (!thread) throw new Error("话题不存在");
		if ((await db.ticketThread.listByThread(thread.id)).length) throw new Error("已有工单订阅的话题不能分诊");
		if (thread.triage !== "pending") throw new Error("话题已分诊");
		if (args.action === "claim") {
			if (!args.projectId || !await db.project.findById(args.projectId)) throw new Error("claim 必须指定存在的 projectId");
			await db.thread.claim(thread.id, args.projectId, (/* @__PURE__ */ new Date()).toISOString());
		} else await db.thread.ignore(thread.id, (/* @__PURE__ */ new Date()).toISOString());
		return JSON.stringify(await db.thread.findById(thread.id));
	}
});
const attach_thread_to_ticket = defineTool({
	name: "attach_thread_to_ticket",
	description: "让一张已有的票接管一条新话题：建订阅并投递。跨项目也走它。只有消息明确指向那张票才挂。",
	parameters: {
		ticketId: {
			type: "string",
			required: true,
			description: "接管这条话题的票。已被人叫停（cancelled）的票挂不上。"
		},
		threadId: {
			type: "string",
			required: true,
			description: "要挂上去的话题 id。"
		},
		note: {
			type: "string",
			description: "一句话路由背景或人给的约束，不要写实现建议，也不要复述原文。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "挂载结果。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		const ticket = await db.ticket.findById(args.ticketId);
		if (!ticket || ticket.status === "cancelled") throw new Error("工单不存在或已 cancelled");
		const thread = await db.thread.findById(args.threadId);
		if (!thread) throw new Error("话题不存在");
		if ((await db.ticketThread.listByTicket(ticket.id)).some((row) => row.threadId === thread.id)) return JSON.stringify({
			linked: true,
			existing: true
		});
		if (!await db.ticketThread.link(ticket.id, thread.id, (/* @__PURE__ */ new Date()).toISOString())) return JSON.stringify({
			linked: true,
			existing: true
		});
		await db.inbox.enqueue({
			type: "project",
			projectId: ticket.projectId,
			origin: "main",
			kind: "ticket",
			ticketId: ticket.id,
			threadId: thread.id,
			message: args.note ?? thread.title
		});
		return JSON.stringify({ linked: true });
	}
});
const unlink_thread = defineTool({
	name: "unlink_thread",
	description: "摘掉挂错的话题，和 attach 严格对称：只删订阅一行，不动话题归属。",
	parameters: {
		ticketId: {
			type: "string",
			required: true,
			description: "要摘掉订阅的票。"
		},
		threadId: {
			type: "string",
			required: true,
			description: "要摘掉的话题 id。这张票的触发来源那条不许摘。"
		},
		reason: {
			type: "string",
			required: true,
			description: "一句话说明为什么不相关，写进记录供回溯。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "摘除结果。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		if (!await db.ticket.findById(args.ticketId)) throw new Error("工单不存在");
		const links = await db.ticketThread.listByTicket(args.ticketId);
		if (links[0]?.threadId === args.threadId) throw new Error("不能摘掉触发来源话题");
		if (!links.some((row) => row.threadId === args.threadId)) throw new Error("订阅不存在");
		await db.ticketThread.unlink(args.ticketId, args.threadId);
		const ticket = await db.ticket.findById(args.ticketId);
		await db.inbox.enqueue({
			type: "project",
			projectId: ticket.projectId,
			origin: "main",
			kind: "notice",
			ticketId: ticket.id,
			threadId: args.threadId,
			message: args.reason
		});
		return JSON.stringify({ unlinked: true });
	}
});
// src/ai/orchestrator/tools/ticket.ts
const create_ticket = defineTool({
	name: "create_ticket",
	description: "开一张票。任务一旦存在，projectId 就必须确定。",
	parameters: {
		title: {
			type: "string",
			required: true,
			description: "一句话说清要做什么，用发起方的语言。不要加需求、验收标准或实现建议。"
		},
		projectId: {
			type: "string",
			required: true,
			description: "这张票归哪个项目。"
		},
		threadIds: {
			type: "array",
			items: { type: "string" },
			required: true,
			description: "触发这张票的话题，至少一条。最早那条是「触发来源」。"
		},
		description: {
			type: "string",
			description: "需求正文，没有就省略。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "新票的 id 和状态。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "main") throw new Error("仅主编排可调用");
		return JSON.stringify(await db.ticket.createWithThreads(args.projectId, args.title, args.threadIds, args.description));
	}
});
// src/ai/orchestrator/index.ts
const orchestrator = definePreset({
	id: "orchestrator",
	name: "主编排",
	instruction: `你是 Nexus 的主编排。全局只有一个，管所有项目。

## 你只管路由

你不写代码、不建分支、不碰仓库。你做的每个决定都是「这件事该归谁」：

- 话题归哪个项目 → 判一次，记下来，之后不再打扰你
- 一件事要不要开票 → 要，就开票派下去
- 跨项目卡住了 → 拉一个 Supervisor
- 只有人能拍板 → 问人

判断完就结束这一轮。不要盯着执行细节，那不是你的事。

## 判断顺序

收到触发后，按这个顺序走，**每一步都可能提前结束**：

1. **已经是老话题了吗** —— 用 list_ticket 看这条话题是否已挂在某张票上。
   挂了就别再判一次，那条触发会自动进对应项目的收件箱。
2. **需要开新票吗** —— 消息明确指向某张已有票 → attach_thread_to_ticket，
   不重复才 create_ticket。判重看「同一个改动意图」，不看措辞；只是相似不算指向。
3. **要不要人拍板** —— 涉及删数据、改 CI 配置、动权限、花钱，先 ask。
4. **派下去** —— dispatch_ticket 给项目编排。

## 三个边界

**不要什么都问人。** 你手上有完整上下文，能自己判断的自己判断。
问人的门槛是「我也不该知道」——权限、预算、产品取舍。不是「我不太确定」。

**不要重复开票。** 同一件事开两张票，两个 Worker 会改同一处代码，
冲突时谁也说不清该以谁为准。

**不要越过项目编排直接指挥 Worker。** 你连 Worker 的 id 都不该持有。

## 跨项目

两个以上项目互相等的时候才拉 Supervisor。判断标准很硬：
**一边的产出是另一边的输入，且都不是几分钟能完事的。**

单个项目内部的依赖不归 Supervisor 管 —— 项目编排自己会处理。

拉起来之后你就不管了，它收工时你会收到一条通知。

## 收尾

会话结束前看一眼 inbox_list。还有 pending 就说明这一轮没做完，
处理完再结束。不要留着自己也解释不清的未处理消息。`,
	description: "全局只有一个，管所有项目和渠道：分诊话题、开票派活、跨项目卡住时拉临时协调者。不写代码。",
	order: 4,
	tools: [
		read_channel,
		reply_channel,
		answer,
		read_mailbox,
		inbox_list,
		inbox_kill,
		ask_user,
		supervisor_list,
		create_supervisor,
		close_supervisor,
		attach_tickets_to_supervisor,
		detach_tickets_from_supervisor,
		defineTool({
			name: "list_ticket",
			description: "列全部任务，可跨项目筛选。判重、找某张票的现状都靠它。",
			parameters: {
				status: {
					type: "string",
					enum: [
						"waiting",
						"queued",
						"running",
						"review",
						"done",
						"cancelled"
					],
					description: "只看某个状态；省略表示不含已终态的票。"
				},
				projectId: {
					type: "string",
					description: "只看某个项目的票。省略表示所有项目。"
				},
				attentionOnly: {
					type: "boolean",
					description: "true 时只返回存在指向它的 pending ask 的票 —— 也就是需要人介入的那些。"
				}
			},
			output: {
				schema: {
					type: "string",
					description: "任务列表，每张票一行：id、项目、标题、状态、PR 状态、有无 pending ask。"
				},
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: async (args, exec) => {
				const identity = await session.resolve(exec.agent?.session.id ?? "");
				if (!identity) throw new Error("当前会话没有 Nexus 身份");
				if (identity.role !== "main") throw new Error("仅主编排可调用");
				return JSON.stringify(await db.ticket.listFiltered(args));
			}
		}),
		create_ticket,
		dispatch_ticket,
		note_ticket,
		triage_thread,
		attach_thread_to_ticket,
		unlink_thread
	],
	plugins: [
		agentInstructions,
		compaction,
		commandGoal,
		delegation,
		skillFilesystem,
		timeContext,
		toolBash,
		toolExecutorPtc,
		toolFs,
		toolFsSearch,
		toolJobs,
		toolPresent,
		toolPwsh,
		toolSkill,
		toolTodo,
		toolWeb
	]
});
// src/ai/supervisor/tools/index.ts
const list_ticket = defineTool({
	name: "list_ticket",
	description: "列自己关联的工单及其进度。每次醒来先看它 —— 不要只信收件箱里那一条转述。",
	parameters: {},
	output: {
		schema: {
			type: "string",
			description: "关联工单：id、项目、状态、prState、有无 pending ask。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "supervisor" || !identity.supervisorId) throw new Error("仅 Supervisor 可调用");
		const links = await db.supervisorTicket.listBySupervisor(identity.supervisorId);
		return JSON.stringify(await Promise.all(links.map(async (link) => {
			const ticket = await db.ticket.findById(link.ticketId);
			if (!ticket) throw new Error("关联工单不存在");
			return {
				...ticket,
				attention: (await db.inbox.listByTicket(ticket.id)).some((row) => row.kind === "ask" && row.status === "pending")
			};
		})));
	}
});
const link_dependency = defineTool({
	name: "link_dependency",
	description: "记一条跨项目前置依赖。方向是「后来的指向先要做的」。别只记在脑子里 —— 你随时可能被重启。",
	parameters: {
		ticketId: {
			type: "string",
			required: true,
			description: "要等的那张票。"
		},
		dependsOn: {
			type: "string",
			required: true,
			description: "必须先做完的那张票。"
		}
	},
	output: {
		schema: {
			type: "string",
			description: "依赖记录结果。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => {
		const identity = await session.resolve(exec.agent?.session.id ?? "");
		if (!identity) throw new Error("当前会话没有 Nexus 身份");
		if (identity.role !== "supervisor" || !identity.supervisorId) throw new Error("仅 Supervisor 可调用");
		const links = await db.supervisorTicket.listBySupervisor(identity.supervisorId);
		if (![args.ticketId, args.dependsOn].every((id) => links.some((row) => row.ticketId === id))) throw new Error("依赖双方必须属于当前 Supervisor");
		await db.ticket.requireOpen(args.ticketId);
		if (!await db.ticket.findById(args.dependsOn)) throw new Error("前置工单不存在");
		if (args.ticketId === args.dependsOn) throw new Error("工单不能依赖自己");
		await db.ticketLink.link(args.ticketId, args.dependsOn, "depends", (/* @__PURE__ */ new Date()).toISOString());
		return JSON.stringify({ linked: true });
	}
});
// src/ai/index.ts
const agents = {
	manager,
	orchestrator,
	supervisor: definePreset({
		id: "supervisor",
		name: "临时协调者",
		instruction: `你是临时协调者。你存在的唯一理由：
**一件事跨了两个以上项目，得有人在中间看。**

## 每次醒来的第一件事

调 list_tickets。**不要只信收件箱里那一条消息** —— 那条消息是别人转述的，
真实进度在票上。转述可能过时，票不会。

## 你协调什么

发现依赖关系、决定谁先做、把两边的结论对齐。

依赖写进库（link_dependency），不要记在脑子里 —— 你随时可能被重启，
而重启后没人知道你上次想到哪了。

## 你不做什么

**不改代码。** 需要改就让项目编排去派 Worker。

**不做产品决定。** 两边要求冲突、都说自己对的时候，往上问。

**不管收工。** 收工是插件按事实推导的，不是你的动作：

- 关联工单**全部 done** → 自动关停，你会直接消失，不用做任何事
- 有工单 **cancelled** → 插件通知主编排，由它决定关掉你、摘掉那张票、还是继续等

你不用判断「是不是差不多了」—— 这件事本来就轮不到会话判断。你的活是推进，
推进到没有依赖可理的时候，收尾自然会发生。

## 边界

你的视野是**这几张票之间**的关系，不是整个系统。
该看全局的是主编排，你只在被拉起来的那件事上有发言权。`,
		description: "只在任务跨两个以上项目时临时拉起，协调依赖、对齐两边的结论，用完即弃。不写代码。",
		order: 6,
		tools: [
			read_channel,
			answer,
			read_mailbox,
			inbox_list,
			inbox_kill,
			dispatch_ticket,
			note_ticket,
			list_ticket,
			defineTool({
				name: "report",
				description: "报给主编排，不等答复。",
				parameters: {
					state: {
						type: "string",
						enum: [
							"progress",
							"ready",
							"failed",
							"dropped"
						],
						required: true,
						description: "progress 在跑 / ready 做完了 / failed 失败了 / dropped 不用做了。"
					},
					summary: {
						type: "string",
						required: true,
						description: "一句话摘要。"
					}
				},
				output: {
					schema: {
						type: "string",
						description: "是否已投递。"
					},
					render: (_args, value) => [{
						type: "text",
						text: value
					}]
				},
				execute: async (args, exec) => {
					const identity = await session.resolve(exec.agent?.session.id ?? "");
					if (!identity) throw new Error("当前会话没有 Nexus 身份");
					if (identity.role !== "supervisor" || !identity.supervisorId) throw new Error("仅 Supervisor 可调用");
					return JSON.stringify(await db.inbox.enqueue({
						type: "main",
						supervisorId: identity.supervisorId,
						origin: "supervisor",
						kind: "notice",
						title: args.state,
						message: args.summary
					}));
				}
			}),
			defineTool({
				name: "ask",
				description: "问主编排，这条线停下等答复。要加人、加项目、或需要上级拍板时用它。",
				parameters: { question: {
					type: "string",
					required: true,
					description: "要主编排回答的问题，一句话说清。"
				} },
				output: {
					schema: {
						type: "string",
						description: "ask 的 id。"
					},
					render: (_args, value) => [{
						type: "text",
						text: value
					}]
				},
				execute: async (args, exec) => {
					const identity = await session.resolve(exec.agent?.session.id ?? "");
					if (!identity) throw new Error("当前会话没有 Nexus 身份");
					if (identity.role !== "supervisor" || !identity.supervisorId) throw new Error("仅 Supervisor 可调用");
					return JSON.stringify(await db.inbox.enqueueAsk({
						type: "main",
						supervisorId: identity.supervisorId,
						origin: "supervisor",
						kind: "ask",
						message: args.question
					}));
				}
			}),
			link_dependency
		],
		plugins: [
			agentInstructions,
			compaction,
			commandGoal,
			delegation,
			skillFilesystem,
			timeContext,
			toolBash,
			toolExecutorPtc,
			toolFs,
			toolFsSearch,
			toolJobs,
			toolPresent,
			toolPwsh,
			toolSkill,
			toolTodo,
			toolWeb
		]
	}),
	worker: definePreset({
		id: "worker",
		name: "执行会话",
		instruction: `你是执行会话。当前工作目录是一个专属 worktree，
分支已经建好，只属于这一张票。

## 干活

改代码、跑测试、提 PR。做完用 report 说一声。

**不要**切分支、不要碰别人的 worktree、不要 force push。
这个 worktree 之外的一切都不归你管。

## 汇报与提问

\`report\` 说事实，发完继续干活：

| state | 什么时候用 |
| --- | --- |
| progress | 阶段性推进，值得说一句 |
| ready | 干完了，PR 已开 |
| failed | 干不了，说清卡在哪 |
| dropped | 这事不用做（复现不了、已被别人修了） |

\`ask\` 要一句话才能继续。**发完这条工作线就停下**，答案到了会重新 prompt 你。
能自己判断的不要 ask —— 你手上有仓库、有 CI、有历史，大部分事你自己就能定。

## 渠道

读原文用 read_channel，路径写法见对应的 \`nexus-channel-<id>\` skill。
要说话用 reply_channel，锚点是触发 id，不用猜发到哪。

**先回复再干活。** 人需要知道我们接下了。但只对真人请求回复 ——
CI 事件、自动化动作不需要你说「收到」。

## 恢复

如果醒来时发现自己有 recoveryNote，说明上次被重启打断了。
**先查目录、git 历史和远端，再决定要不要重做外部动作。**

重复开 PR、重复发评论是这类事故里最常见的一种。

## 后台任务

起了服务器、跑了长测试，回合结束前用 report 说清楚还在跑什么。
框架会让票继续占着槽位，最多 30 分钟。

不要留一个没人接的后台进程就结束 —— 那等于把烂摊子丢给下一个会话。`,
		description: "在一张任务专属的 worktree 里干活：改代码、跑测试、开 PR，用 report 汇报进度。",
		order: 7,
		tools: [
			read_channel,
			reply_channel,
			defineTool({
				name: "report",
				description: "报告进度。发完继续干活，不等回复。要对方动脑子的走 ask。",
				parameters: {
					state: {
						type: "string",
						enum: [
							"progress",
							"ready",
							"failed",
							"dropped"
						],
						required: true,
						description: "progress 在跑 / ready 干完了（PR 已开）/ failed 失败了 / dropped 不用做了。「我在等答复」不占状态位。"
					},
					summary: {
						type: "string",
						required: true,
						description: "一句话摘要，短。给机器和面板看，详细解释写正文。"
					}
				},
				output: {
					schema: {
						type: "string",
						description: "是否已投递。"
					},
					render: (_args, value) => [{
						type: "text",
						text: value
					}]
				},
				execute: async (args, exec) => {
					const identity = await session.resolve(exec.agent?.session.id ?? "");
					if (!identity) throw new Error("当前会话没有 Nexus 身份");
					if (identity.role !== "worker" || !identity.workerId || !identity.ticketId) throw new Error("仅 Worker 可调用");
					const worker = await db.worker.findById(identity.workerId);
					if (!worker || worker.status === "ended") throw new Error("Worker 已结束");
					return JSON.stringify(await db.worker.reportProgress(worker.id, args.state, args.summary));
				}
			}),
			defineTool({
				name: "ask",
				description: "问项目编排。发完这条工作线停下，等答案被 prompt 回来。不要一边问一边继续做。",
				parameters: { question: {
					type: "string",
					required: true,
					description: "要问的问题，一句话说清卡在哪。"
				} },
				output: {
					schema: {
						type: "string",
						description: "ask 的 id。"
					},
					render: (_args, value) => [{
						type: "text",
						text: value
					}]
				},
				execute: async (args, exec) => {
					const identity = await session.resolve(exec.agent?.session.id ?? "");
					if (!identity) throw new Error("当前会话没有 Nexus 身份");
					if (identity.role !== "worker" || !identity.workerId || !identity.ticketId) throw new Error("仅 Worker 可调用");
					const ticket = await db.ticket.requireOpen(identity.ticketId);
					const worker = await db.worker.findById(identity.workerId);
					if (!worker || worker.status === "ended") throw new Error("Worker 已结束");
					return JSON.stringify(await db.inbox.enqueueAsk({
						type: "project",
						projectId: ticket.projectId,
						origin: "worker",
						kind: "ask",
						ticketId: ticket.id,
						workerId: worker.id,
						message: args.question
					}));
				}
			})
		],
		plugins: [
			agentInstructions,
			compaction,
			commandGoal,
			delegation,
			skillFilesystem,
			timeContext,
			toolBash,
			toolExecutorPtc,
			toolFs,
			toolFsSearch,
			toolJobs,
			toolPresent,
			toolPwsh,
			toolSkill,
			toolTodo,
			toolWeb
		]
	})
};
// src/events/agent-created.ts
async function handleAgentCreated(ctx, agent) {
	const role = await session.attach(agent);
	if (!role) return;
	const id = ctx.agentPresets.composedPreset(agent.ctx);
	const definition = agents[id];
	ctx.effect(() => agent.ctx.effect(() => {
		const disposers = definition.tools.map((tool) => agent.ctx.tools.register(tool));
		return () => disposers.forEach((dispose) => dispose());
	}, "nexus:tools"), "nexus:agent-tools");
	if (role === "worker") return;
	ctx.effect(() => agent.ctx.on("agent/status", ({ status }) => {
		if (status === "idle") inbox.notify(agent).catch((error) => ctx.logger.error(error));
	}), "nexus:mailbox-notice");
	await inbox.notify(agent, true);
}
// src/events/session-event.ts
async function handleSessionEvent(source, event) {
	await worker$1.observe(source, event);
}
// src/runtime/scheduler.ts
const RESERVED_KEYS = /* @__PURE__ */ new Set([
	"id",
	"cron",
	"status",
	"cronSource",
	"createdAt",
	"updatedAt",
	"lastRunAt",
	"lastError",
	"runCount",
	"hasHandler",
	"nextRunAt"
]);
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const messageOf = (err) => err instanceof Error ? err.message : String(err);
function parseId(val) {
	if (typeof val === "string" && val.trim()) return val.trim();
	throw new TypeError("定时任务的 id 不能为空");
}
const refId = (ref) => parseId(typeof ref === "string" ? ref : ref.id);
function parseCron(val, id) {
	const cron = typeof val === "string" ? val.trim() : "";
	if (!cron) throw new TypeError(`定时任务 "${id}" 的 cron 不能为空`);
	try {
		new Cron(cron, { paused: true }).stop();
	} catch (e) {
		throw new Error(`定时任务 "${id}" 的 cron 表达式无效：${cron}`, { cause: e });
	}
	return cron;
}
function pickExtra(input) {
	const extra = {};
	for (const [k, v] of Object.entries(input)) if (v !== void 0 && !RESERVED_KEYS.has(k)) extra[k] = v;
	return extra;
}
var JsonSchedulerImpl = class {
	filePath;
	options;
	records = /* @__PURE__ */ new Map();
	hydration;
	pending = Promise.resolve();
	saveError;
	disposed = false;
	constructor(filePath, options = {}) {
		this.filePath = resolve(filePath);
		this.options = options;
		this.hydration = this.load();
	}
	ready = () => this.hydration;
	use(input, handler) {
		if (typeof handler !== "function") throw new TypeError("use() 的第二个参数必须是函数");
		const id = parseId(input.id);
		const cron = parseCron(input.cron, id);
		const extra = pickExtra(input);
		let record = this.records.get(id);
		if (record) {
			if (record.cronSource === "use") record.cron = cron;
			record.handler = handler;
			Object.assign(record.extra, extra);
			record.updatedAt = nowIso();
		} else {
			const time = nowIso();
			record = {
				id,
				cron,
				status: "running",
				cronSource: "use",
				createdAt: time,
				updatedAt: time,
				lastRunAt: null,
				lastError: null,
				runCount: 0,
				extra,
				handler
			};
			this.records.set(id, record);
		}
		this.arm(record);
		this.queueSave();
		return () => this.remove(id);
	}
	update(patch) {
		const record = this.records.get(parseId(patch.id));
		if (!record) return false;
		if (patch.cron !== void 0) {
			record.cron = parseCron(patch.cron, record.id);
			record.cronSource = "update";
		}
		Object.assign(record.extra, pickExtra(patch));
		record.updatedAt = nowIso();
		if (patch.cron !== void 0) this.arm(record);
		this.queueSave();
		return true;
	}
	remove(ref) {
		const record = this.records.get(refId(ref));
		if (!record) return false;
		this.disarm(record);
		this.records.delete(record.id);
		this.queueSave();
		return true;
	}
	async trigger(ref) {
		const record = this.records.get(refId(ref));
		if (!record) throw new Error(`定时任务 "${refId(ref)}" 不存在`);
		if (!record.handler) throw new Error(`定时任务 "${record.id}" 还没有绑定回调`);
		await this.run(record, "manual");
	}
	stop(ref) {
		return this.setStatus(refId(ref), "paused");
	}
	start(ref) {
		return this.setStatus(refId(ref), "running");
	}
	stopAll() {
		this.setAllStatus("paused");
	}
	startAll() {
		this.setAllStatus("running");
	}
	jobs() {
		return [...this.records.values()].map((r) => ({
			...r.extra,
			id: r.id,
			cron: r.cron,
			status: r.status,
			hasHandler: Boolean(r.handler),
			nextRunAt: r.status === "running" ? r.job?.nextRun()?.toISOString() ?? null : null,
			lastRunAt: r.lastRunAt,
			lastError: r.lastError,
			runCount: r.runCount,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt
		}));
	}
	async flush() {
		await this.pending;
		const err = this.saveError;
		if (err !== void 0) {
			this.saveError = void 0;
			throw err;
		}
	}
	async dispose() {
		this.disposed = true;
		for (const r of this.records.values()) this.disarm(r);
		await this.pending;
	}
	setStatus(id, status) {
		const record = this.records.get(id);
		if (!record || record.status === status) return Boolean(record);
		record.status = status;
		record.updatedAt = nowIso();
		status === "paused" ? this.disarm(record) : this.arm(record);
		this.queueSave();
		return true;
	}
	setAllStatus(status) {
		let changed = false;
		for (const record of this.records.values()) if (record.status !== status) {
			record.status = status;
			record.updatedAt = nowIso();
			status === "paused" ? this.disarm(record) : this.arm(record);
			changed = true;
		}
		if (changed) this.queueSave();
	}
	arm(record) {
		this.disarm(record);
		if (this.disposed || !record.handler || record.status === "paused") return;
		try {
			record.job = new Cron(record.cron, {
				protect: this.options.protect ?? true,
				unref: this.options.unref ?? false,
				timezone: this.options.timezone,
				catch: true
			}, () => this.run(record, "schedule"));
		} catch (e) {
			record.lastError = messageOf(e);
			this.report(e, {
				phase: "run",
				id: record.id
			});
		}
	}
	disarm(record) {
		record.job?.stop();
		record.job = void 0;
	}
	async run(record, reason) {
		const startedAt = /* @__PURE__ */ new Date();
		record.lastRunAt = startedAt.toISOString();
		try {
			await record.handler({
				id: record.id,
				cron: record.cron,
				reason,
				startedAt,
				job: this.jobs().find((j) => j.id === record.id)
			});
			record.lastError = null;
		} catch (e) {
			record.lastError = messageOf(e);
			if (reason === "manual") throw e;
			this.report(e, {
				phase: "run",
				id: record.id
			});
		} finally {
			record.runCount++;
		}
	}
	report(error, context) {
		if (this.options.onError) {
			try {
				this.options.onError(error, context);
			} catch {}
			return;
		}
		console.error(`[json-scheduler] ${context.phase} 失败${context.id ? `（${context.id}）` : ""}:`, error);
	}
	queueSave() {
		this.pending = this.pending.then(() => this.write()).then(() => {
			this.saveError = void 0;
		}).catch((e) => {
			this.saveError = e;
			this.report(e, { phase: "save" });
		});
	}
	async write() {
		const payload = {
			version: 1,
			updatedAt: nowIso(),
			jobs: [...this.records.values()].map((r) => ({
				...r.extra,
				id: r.id,
				cron: r.cron,
				status: r.status,
				cronSource: r.cronSource,
				createdAt: r.createdAt,
				updatedAt: r.updatedAt,
				lastRunAt: r.lastRunAt,
				lastError: r.lastError,
				runCount: r.runCount
			}))
		};
		await mkdir(dirname(this.filePath), { recursive: true });
		const tmp = `${this.filePath}.${process.pid}.tmp`;
		await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		await rename$1(tmp, this.filePath);
	}
	async load() {
		let raw;
		try {
			raw = await readFile(this.filePath, "utf8");
		} catch (e) {
			if (e?.code === "ENOENT") return;
			throw e;
		}
		if (!raw.trim()) return;
		const parsed = JSON.parse(raw);
		const list = Array.isArray(parsed) ? parsed : parsed?.jobs ?? [];
		for (const stored of list) {
			if (!stored || typeof stored !== "object") continue;
			const id = typeof stored.id === "string" ? stored.id.trim() : "";
			const cron = typeof stored.cron === "string" ? stored.cron.trim() : "";
			if (!id || !cron) continue;
			const status = stored.status === "paused" ? "paused" : "running";
			const cronSource = stored.cronSource === "update" ? "update" : "use";
			const extra = pickExtra(stored);
			let existing = this.records.get(id);
			if (!existing) {
				const time = typeof stored.createdAt === "string" ? stored.createdAt : nowIso();
				existing = {
					id,
					cron,
					status,
					cronSource,
					createdAt: time,
					updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : time,
					lastRunAt: stored.lastRunAt ?? null,
					lastError: stored.lastError ?? null,
					runCount: stored.runCount ?? 0,
					extra
				};
				this.records.set(id, existing);
			} else {
				existing.status = status;
				existing.cronSource = cronSource;
				if (cronSource === "update") existing.cron = cron;
				Object.assign(existing.extra, {
					...extra,
					...existing.extra
				});
			}
		}
		for (const r of this.records.values()) if (r.handler) this.arm(r);
	}
};
const scheduler = new JsonSchedulerImpl(join(DSH_PLUGIN_HOME, "jobs.json"));
await scheduler.ready();
// src/service/runtime.ts
let starting = null;
let dispose = null;
const runtime = defineService({ start() {
	if (dispose) return Promise.resolve(dispose);
	if (starting) return starting;
	starting = activate().finally(() => {
		starting = null;
	});
	return starting;
} });
async function activate() {
	const controller = new AbortController();
	const pending = /* @__PURE__ */ new Set();
	const unregister = [];
	const stops = [];
	let closing = null;
	const close = () => {
		if (closing) return closing;
		closing = (async () => {
			controller.abort(/* @__PURE__ */ new Error("runtime_stopped"));
			for (const remove of unregister) remove();
			await Promise.allSettled(stops.map((stop) => stop()));
			await Promise.allSettled([...pending]);
			dispose = null;
		})();
		return closing;
	};
	function track(action) {
		if (controller.signal.aborted) return Promise.resolve();
		const task = Promise.resolve().then(action).finally(() => pending.delete(task));
		pending.add(task);
		return task;
	}
	try {
		stops.push(() => channelAuth.cleanup());
		stops.push(session.start(), worktree.start(), inbox.start(), worker$1.start());
		await scheduler.ready();
		await project.sync();
		await worker$1.recover();
		unregister.push(scheduler.use({
			id: "nexus:runtime",
			cron: "* * * * * *"
		}, () => track(async () => {
			await worker$1.reconcileBackground();
			await inbox.deliverAnswers();
			await inbox.deliver();
			await worker$1.reconcile();
		})));
		unregister.push(scheduler.use({
			id: "nexus:github",
			cron: "*/30 * * * * *"
		}, () => track(async () => {
			const collected = await github.collectAll(controller.signal);
			const flushed = await github.flush(controller.signal);
			const failures = [...collected, ...flushed].filter((result) => !result.ok);
			if (failures.length) throw new Error(failures.map((result) => result.reason ?? "channel_operation_failed").join(", "));
		})));
		unregister.push(scheduler.use({
			id: "nexus:gitlab",
			cron: "*/30 * * * * *"
		}, () => track(async () => {
			const collected = await gitlab.collectAll(controller.signal);
			const flushed = await gitlab.flush(controller.signal);
			const failures = [...collected, ...flushed].filter((result) => !result.ok);
			if (failures.length) throw new Error(failures.map((result) => result.reason ?? "channel_operation_failed").join(", "));
		})));
		dispose = close;
		return close;
	} catch (error) {
		await close();
		throw error;
	}
}
// src/index.ts
const inject = [
	"agents",
	"agentPresets",
	"sessionController",
	"workspaceRegistry",
	"sessionQuery",
	"credentials",
	"connection",
	"webServer"
];
async function apply(ctx) {
	await ctx.effect(async function* () {
		for (const definition of Object.values(agents)) {
			yield await ctx.agentPresets.register(definition.preset);
			yield session.register(definition.preset.id);
		}
	}, "nexus:presets");
	ctx.on("agent/created", ({ agent }) => handleAgentCreated(ctx, agent));
	ctx.on("session/event", handleSessionEvent);
	await ctx.effect(() => server(ctx, {
		origin: ctx.webServer.getOrigin(),
		owner: (event) => {
			const admission = ctx.connection.admit({ headers: event.req.headers });
			return !("rejection" in admission) && admission.peer.principal.kind === "owner";
		}
	}), "nexus:routes");
	await ctx.effect(() => runtime.start(), "nexus:runtime");
}
export { apply, inject };
