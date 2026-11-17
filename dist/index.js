import { a as channelAuth, c as session, d as defineService, f as DSH_PLUGIN_HOME, i as worktree, l as channelProxyEnvironment, n as server, o as shell, p as db, r as project, s as inbox, t as channel, u as setting } from "./channel-Cs8h8GPx.js";
import process from "node:process";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { createRouteDispatcher } from "@deepseek-ai/dsh-http-proxy";
import { getServerContext } from "dsh-h3/utils";
import { fetch } from "undici";
import { mkdir, readFile, rename as rename$1, writeFile } from "node:fs/promises";
import { SessionId } from "@deepseek-ai/dsh-session";
import { Cron } from "croner";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
		const env = await channelProxyEnvironment(new URL(`https://${request.site}`), shell.commandEnvironment());
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
		const bots = (await db.channelAccount.findByChannel("github")).filter((account) => account.role === "bot");
		const human = author.type !== "Bot" && !actorName.endsWith("[bot]") && !bots.some((bot) => bot.name.toLowerCase() === actorName.toLowerCase());
		const body = typeof row.body === "string" ? row.body : typeof row.state === "string" ? row.state : "";
		const mentioned = bots.some((bot) => new RegExp(`@${escapeRegex$1(bot.name)}(?![a-z0-9-])`, "i").test(body));
		const at = timestamp$1(row.updated_at ?? row.submitted_at ?? row.created_at);
		const id = `${thread.id}:${sourceKind}:${identity$1(row.id)}`;
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
		const admin = (await setting.load()).administrators.some((name) => name.toLowerCase() === actorName.toLowerCase());
		if (!human || historical && !subscriptions.length) return;
		if (!subscriptions.length && (!admin || kind !== "open" && !mentioned || thread.triage === "ignored" && !mentioned)) return;
		const targets = /* @__PURE__ */ new Map();
		for (const ticketId of subscriptions) {
			const ticket = await db.ticket.findById(ticketId);
			if (!ticket) continue;
			if (["done", "cancelled"].includes(ticket.status)) {
				if (!mentioned) continue;
				if (await db.ticket.reopen(ticketId, trigger.at)) {
					await db.worker.queue(ticketId, ticket.projectId);
					targets.set(ticket.projectId, {
						projectId: ticket.projectId,
						ticketId
					});
				}
				continue;
			}
			targets.set(ticket.projectId, {
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
			const worker = branch ? await db.worker.findByBranch(branch) : void 0;
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
			if (state === "merged" || state === "closed") await this.threadClosed(projectId, thread, state, remote.merged === true ? timestamp$1(remote.merged_at ?? remote.closed_at ?? remote.updated_at) : timestamp$1(remote.closed_at ?? remote.updated_at), branch);
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
	async threadClosed(projectId, thread, outcome, at, branch) {
		const ended = await db.ticket.closeThread(thread.id, outcome, at, branch);
		if (outcome !== "merged" || !ended.length) return;
		for (const source of await db.thread.listByChannel("github")) {
			if (source.kind !== "issue" || source.projectId !== projectId || !source.url) continue;
			if (!(await db.ticketThread.listTicketIds(source.id)).some((id) => ended.includes(id))) continue;
			let resource;
			try {
				resource = parseResource$1(source.url);
			} catch {
				continue;
			}
			if (resource.kind !== "issue") continue;
			await this.request(`repos/${resource.repository}/issues/${resource.number}`, void 0, "PATCH", { state: "closed" }).catch(() => void 0);
		}
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
		if (author.type !== "User" || login.endsWith("[bot]") || accounts.some((account) => account.role === "bot" && account.name.toLowerCase() === login.toLowerCase()) || !(await setting.load()).administrators.some((name) => name.toLowerCase() === login.toLowerCase())) return;
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
						if (kind === "pull") await this.observeMergeRequest(projectId, thread, row, signal);
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
						if (thread.kind === "pull" && (await db.ticketThread.listTicketIds(thread.id)).length) await this.observeMergeRequest(projectId, thread, void 0, signal);
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
		const bots = (await db.channelAccount.findByChannel("gitlab")).filter((account) => account.role === "bot");
		const human = author.bot !== true && row.system !== true && !bots.some((bot) => bot.name.toLowerCase() === actorName.toLowerCase());
		const body = typeof row.body === "string" ? row.body : typeof row.description === "string" ? row.description : typeof row.state === "string" ? row.state : "";
		const mentioned = bots.some((bot) => new RegExp(`(?:^|[^a-z0-9_@])@${escapeRegex(bot.name)}(?![a-z0-9_.-])`, "i").test(body));
		const at = timestamp(row.updated_at ?? row.created_at);
		const id = `${thread.id}:${sourceKind}:${identity(row.id)}`;
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
		const admin = (await setting.load()).administrators.some((name) => name.toLowerCase() === actorName.toLowerCase());
		if (!human || historical && !subscriptions.length) return;
		if (!subscriptions.length && (!admin || kind !== "open" && !mentioned || thread.triage === "ignored" && !mentioned)) return;
		const targets = /* @__PURE__ */ new Map();
		for (const ticketId of subscriptions) {
			const ticket = await db.ticket.findById(ticketId);
			if (!ticket) continue;
			if (["done", "cancelled"].includes(ticket.status)) {
				if (!mentioned) continue;
				if (await db.ticket.reopen(ticketId, at)) {
					await db.worker.queue(ticketId, ticket.projectId);
					targets.set(ticket.projectId, {
						projectId: ticket.projectId,
						ticketId
					});
				}
				continue;
			}
			targets.set(ticket.projectId, {
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
	async observeMergeRequest(projectId, thread, row, signal) {
		const target = parseResource(thread.url, await this.site());
		if (target.kind !== "pull") return;
		const remote = row ?? record(await this.request(target.site, apiRoot(target), signal));
		validateTopic(remote, target);
		const state = remote.state === "merged" ? "merged" : remote.state === "closed" ? "closed" : remote.state === "opened" ? "open" : null;
		if (!state) throw new GitLabError("invalid_response");
		const branch = typeof remote.source_branch === "string" ? text(remote.source_branch) : null;
		if (state === "open") return;
		const at = timestamp(remote.merged_at ?? remote.closed_at ?? remote.updated_at);
		for (const ticketId of await db.ticketThread.listTicketIds(thread.id)) {
			const ticket = await db.ticket.findById(ticketId);
			if (!ticket || ticket.projectId !== projectId || ticket.prUrl && ticket.prUrl !== thread.url) continue;
			if (!["done", "cancelled"].includes(ticket.status)) await db.ticket.setPullRequest(ticketId, thread.url, state, ticket.ciState);
		}
		await this.threadClosed(projectId, thread, state, at, branch);
	}
	async threadClosed(projectId, thread, outcome, at, branch) {
		const ended = await db.ticket.closeThread(thread.id, outcome, at, branch);
		if (outcome !== "merged" || !ended.length) return;
		for (const source of await db.thread.listByChannel("gitlab")) {
			if (source.kind !== "issue" || source.projectId !== projectId || !source.url) continue;
			if (!(await db.ticketThread.listTicketIds(source.id)).some((id) => ended.includes(id))) continue;
			let target;
			try {
				target = parseResource(source.url, await this.site());
			} catch {
				continue;
			}
			if (target.kind !== "issue") continue;
			await this.request(target.site, apiRoot(target), void 0, "PUT", { state_event: "close" }).catch(() => void 0);
		}
	}
	async acceptAnswers(thread, row) {
		const author = record(row.author);
		const login = text(author.username);
		const accounts = await db.channelAccount.findByChannel("gitlab");
		if (author.bot === true || row.system === true || accounts.some((account) => account.role === "bot" && account.name.toLowerCase() === login.toLowerCase()) || !(await setting.load()).administrators.some((name) => name.toLowerCase() === login.toLowerCase())) return;
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
		} else if (await isThreadId(resource)) {
			const thread = await db.thread.findById(resource);
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
async function isThreadId(value) {
	if (!/^[\w-]+:[\w./-]+$/.test(value)) return false;
	return Boolean(await db.thread.findById(value));
}
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
	description: "读取当前角色未处理邮件，以及可用项目的 id、仓库地址和本地路径。可传 ids 一次读取指定多条邮件。主编排先用它确定分诊目标；读取标为已读，处理完用 inbox_kill，ask 必须用 answer。",
	parameters: { ids: {
		type: "array",
		items: { type: "string" },
		description: "只读取这些邮件 id；省略则读取全部未处理邮件。"
	} },
	output: {
		schema: {
			type: "string",
			description: "完整角色邮箱，或所选邮件。"
		},
		render: (_args, value) => [{
			type: "text",
			text: value
		}]
	},
	execute: async (args, exec) => JSON.stringify(await inbox.read(exec.agent?.session.id ?? "", true, args.ids))
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
				if (ticket.paused) continue;
				if ((await db.inbox.listByTicket(ticket.id)).some((message) => message.kind === "ask" && message.status === "pending" && message.workerId === worker.id)) continue;
				const project = await db.project.findById(ticket.projectId);
				if (!project) {
					await db.ticket.setPrepareError(ticket.id, "project_not_found", (/* @__PURE__ */ new Date()).toISOString());
					continue;
				}
				if (!project.enabled) continue;
				let started = false;
				try {
					const branch = `nexus/${ticket.id}`;
					let directory = worker.worktree;
					if (await session.history(worker.id).then(() => true).catch(() => false)) {
						if (directory && worker.branch === branch) await worktree.verify(project.directory, directory, branch);
						directory = directory ?? project.directory;
					} else {
						await session.create("worker", {
							sessionId: worker.id,
							ticketId: ticket.id,
							projectId: project.id,
							directory: project.directory,
							title: worker.title ?? ticket.title
						});
						if (stopped) throw new Error("worker_stopped");
						if (directory && worker.branch === branch) await worktree.verify(project.directory, directory, branch);
						else {
							const created = await worktree.create(await session.activate(worker.id), ticket.id);
							directory = created.worktree;
							await db.worker.update(worker.id, {
								branch: created.branch,
								worktree: directory
							});
						}
					}
					if (!directory) throw new Error("worker_directory_required");
					if (stopped) throw new Error("worker_stopped");
					const threads = await db.ticketThread.listByTicket(ticket.id);
					const sources = await Promise.all(threads.map(async (thread) => {
						const latest = await db.trigger.findLatestByThread(thread.threadId);
						return latest ? `${thread.threadId}（trigger ${latest.id}）` : thread.threadId;
					}));
					const prompt = [
						`${ticket.id}: ${ticket.title}`,
						ticket.description ?? "",
						`执行配置：${JSON.stringify({
							autoMerge: settings.autoMerge,
							autoMergeMaxLines: settings.autoMergeMaxLines
						})}`,
						"来源话题：",
						...sources,
						worker.recoveryNote ?? ""
					].filter(Boolean).join(String.fromCharCode(10));
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
						const latest = await db.ticket.findById(ticket.id);
						if (!latest || latest.status !== "done" && latest.status !== "cancelled") await db.ticket.update(ticket.id, {
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
					const latest = await db.ticket.findById(ticket.id);
					if (latest && (latest.status === "done" || latest.status === "cancelled")) {
						await db.worker.end(worker.id, "stopped", now);
						continue;
					}
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
	if (ticket && ticket.status !== "done" && ticket.status !== "cancelled") {
		if (!reason && current.reportState === "dropped") await db.ticket.finish(ticket.id, "done", now, now);
		else await db.ticket.update(ticket.id, {
			status: !reason && current.reportState === "ready" ? "review" : "waiting",
			updatedAt: now
		});
	}
	if (!reason && current.reportState !== "failed") await archive(current.id);
}
async function archive(id) {
	if (!(await setting.load()).autoArchiveWorkers) return;
	try {
		await getServerContext(server).workspaceRegistry.archiveSession(SessionId(id), { stopActivity: true });
	} catch (error) {
		getServerContext(server).logger.warn("nexus: archiving finished worker %s failed: %s", id, error instanceof Error ? error.message : String(error));
	}
}
// src/ai/manager/index.ts
const manager = definePreset({
	id: "manager",
	name: "项目编排",
	description: "一个仓库一个：派 Worker、看汇报、收尾，任务走到哪一步由它推。不写代码。",
	instruction: `你是某个仓库的项目编排。长驻，管这个仓库下所有任务。

当前工作目录是 Nexus 的共享代理工作区，不是代码仓库。先用 read_mailbox 读取你的项目 id、仓库地址和本地目录；读代码时用仓库绝对路径。克隆、改代码、切换分支和提交都是 Worker 的事。

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
				await db.ticket.setPrepareError(args.ticketId, null, (/* @__PURE__ */ new Date()).toISOString());
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

你运行在 Nexus 的共享代理工作区，不是任一项目的代码仓库。收到消息先用 read_mailbox 读取邮件、可用项目 id 与仓库地址，再决定话题归属，不从显示名或当前目录猜项目。

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

改代码、跑测试，明确 git add 本任务文件后用 git commit 提交、git push 推送；GitHub 用 gh pr create，GitLab 用 glab mr create 发布，再用 report 汇报 ready 和实际 PR/MR URL。
GitHub 操作用 gh，GitLab 操作用 glab；命令由独立 CLI 包装脚本绑定已配置的机器人账号，Git 自动使用对应渠道的提交身份。禁止使用全局 CLI 登录身份，不运行 auth login，不读取或输出 token。
发布前检查当前分支、origin 和已有 PR/MR，复用当前票分支的已有结果，避免重复发布。
不要自动纳入不明文件；仅提交本任务明确暂存的改动，发布前确认本任务改动已全部提交。
PR 描述中的正式 issue 链接必须从 read_channel 的 ticket/<当前任务号> 及关联 thread 上下文取得，不得猜造。

## 交付

UI 变更的 PR 描述必须同时包含明确标注的 Before 和 After 真实应用截图或演示，并注明基线及变更版本。
两边使用相同场景、视口、主题和相关 UI 状态；后续 UI 改动后更新证据。只有 After、设计稿、占位标记都不是完整证据。
不要暴露私有渠道内容或凭据。无法取得真实基线时如实说明缺失与限制，交付保持未完成，不得汇报 UI PR ready。
你负责捕获和验证对照，编排会话还需核对证据后才能交付 ready。

按匹配规则、任务、提示及仓库指令请求所需 review；报告 ready 不必等待审批，审批到达后自行核实当前 head 的指令要求和证据。
GitHub 自动合并由你按以下交付要求直接调用原生 CLI，不经宿主合并服务。运行上下文给出当前 autoMerge 和 autoMergeMaxLines；不要从消息猜造或更改这些配置。
发布用 gh 和 glab 的渠道机器人身份；自动合并必须使用 gh-default，它绕过机器人配置、使用你默认登录的 gh 账号。未开启 autoMerge 时所有 PR 均由人工合并。
仅对你从当前票分支打开且已 ready 的 PR，在 additions + deletions 严格小于 autoMergeMaxLines、所有指令要求的审批均覆盖当前 head 时，才可开启自动合并。
涉及用户可见变化时，指令还必须明确谁有权审批此类变化，且其审批覆盖当前 head；不得自行指定管理员代替该授权，不得把 marker 当成证据或授权。
使用的原生命令必须是 gh-default pr merge <number> --auto --merge --match-head-commit <sha> --repo <repository>；不得改为直接 merge、squash、--admin 或 bot API 合并。
任何条件不再成立（包括请求修改），以及每次向 PR push 前，先用 gh-default pr merge <number> --disable-auto --repo <repository> 撤销；撤销未确认不得 push。
新 head 满足条件后才重新开启。不满足自动合并条件时在报告中说明需人工合并；不得代任何 reviewer 审批或使用其身份 review。
GitLab 用原生 glab 发布、查看及更新 MR，当前不启用自动合并，交由人工合并。
审批是否为任务所需、指令是否完整、UI 对照是否真实且与当前版本一致属于你和编排会话必须核实的语义判断，机械检查不替代这些判断。

首次评估真人 reviewer 的反馈时，将该人逐 PR 记入 report 的 credited reviewers，并为 PR 分支的每个提交补上一次 Co-authored-by trailer；后续新增提交沿用所有已记名 reviewer。
先撤销自动合并，再 git fetch origin；从 PR 读取 baseRefName，计算 base=$(git merge-base HEAD origin/<base branch>) 和 old=$(git rev-parse origin/<head branch>)。
用 FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'git interpret-trailers --if-exists addIfDifferent --trailer "<trailer>"' $base..HEAD，仅改提交消息；每人一个 trailer，内容为 Co-authored-by: <name or login> <id+login@users.noreply.github.com>，id 从渠道只读用户资料取得，不能猜。
仅消息改写时用 git push --force-with-lease=<head branch>:$old 推送本票分支；lease 被拒绝立即停下并报告，不得覆盖远端新提交。
审批同样覆盖仅消息改写、tree 完全相同的提交副本；必须核验相同 tree，不能自行把任意旧提交视为已审批。
PR 已合并时不改写，在报告记录尚未记名的人；不得用空提交记名。不记 bot（包括 [bot] 及指令指定的 review bot）、PR 作者、agent 账号或指令指定的 commit author。
如果真人正在解决同一问题，且其分支或 PR 包含本票代码（本票提交或移植的本票改动），通过渠道能力立即关闭本票 PR，不询问，关闭说明只用一句话指向真人 PR。
只是相关但不含本票代码不是关闭理由。关闭 PR 即结束本票，不再发送其他消息。

**不要**切分支、不要碰别人的 worktree、不要无条件 force push；仅上述 reviewer 记名的消息改写可使用已核实的 force-with-lease。
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
	const id = ctx.agentPresets.composedPreset(agent.ctx);
	const definition = agents[id];
	if (definition?.tools.length) ctx.effect(() => agent.ctx.effect(() => {
		const disposers = definition.tools.map((tool) => agent.ctx.tools.register(tool));
		return () => disposers.forEach((dispose) => dispose());
	}, "nexus:tools"), "nexus:agent-tools");
	const role = await session.attach(agent);
	if (!role) return;
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
	let restoreShell;
	let closing = null;
	const close = () => {
		if (closing) return closing;
		closing = (async () => {
			controller.abort(/* @__PURE__ */ new Error("runtime_stopped"));
			for (const remove of unregister) remove();
			await Promise.allSettled(stops.map((stop) => stop()));
			await Promise.allSettled([...pending]);
			await restoreShell?.();
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
		stops.push(session.start(), worktree.start(), project.start(), inbox.start(), worker$1.start());
		await scheduler.ready();
		await session.workspace();
		await session.create("main", {});
		await project.sync();
		restoreShell = await shell.start();
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
			id: "nexus:projects",
			cron: "*/5 * * * * *"
		}, () => track(async () => {
			await project.sync();
			await shell.refresh();
		})));
		unregister.push(scheduler.use({
			id: "nexus:github",
			cron: "*/30 * * * * *"
		}, () => track(async () => {
			await project.sync();
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
// src/service/skill.ts
const skill = defineService({
	roots() {
		return [join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "skills")].filter((path) => existsSync(path));
	},
	async install(ctx) {
		const roots = skill.roots();
		if (!roots.length) return () => void 0;
		const fiber = ctx.plugin(await import("@deepseek-ai/dsh-skill-filesystem"), { customSkillDirs: roots });
		return () => void fiber.dispose();
	}
});
// src/index.ts
const inject = [
	"agents",
	"agentPresets",
	"sessionController",
	"workspaceRegistry",
	"sessionQuery",
	"credentials",
	"connection",
	"webServer",
	"worktrees"
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
	await ctx.effect(() => skill.install(ctx), "nexus:skills");
}
export { apply, inject };
