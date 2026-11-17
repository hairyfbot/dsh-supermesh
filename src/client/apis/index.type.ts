export type GetApiNexusPanelResponse = {
  projects: { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }[];
  tickets: { id: string; createdAt: string; channelId: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; updatedAt: string; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
  graph: { nodes: ({ id: string; kind: string; label: string; status: string; projectId: string; ticketId: null | string; sessionId: null | string } | { id: string; kind: string; label: string; status: "queued" | "running" | "ended"; projectId: null | string; ticketId: string; sessionId: string } | { id: string; kind: string; label: string; status: "active" | "closed"; projectId: null | string; ticketId: null | string; sessionId: null | string })[]; edges: { source: string; target: string; kind: string }[] };
  run: { state: string; reason: null | string };
  inbox: {
    pending: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
    resolved: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
    blocked: { id: string; createdAt: string; channelId: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; updatedAt: string; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
  };
  topics: { threads: { id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; updatedAt: string; projectId: null | string; title: string; url: null | string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[]; triggers: { id: string; at: string; channelId: string; kind: "ci" | "comment" | "open" | "close" | "push"; ref: null | string; text: string; threadId: string; actorName: null | string; human: number; mentioned: number; url: null | string }[]; subscriptions: { createdAt: string; threadId: string; ticketId: string }[] };
  deliveries: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  channels: { enabled: false | true; accounts: { id: string; name: string; createdAt: string; channelId: string; role: "bot" | "admin"; avatar: null | string; status: "online" | "offline" }[]; id: string; name: string; host: null | string; createdAt: string }[];
  settings: { maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
};
export type GetApiNexusTicketsidResponse = {
  ticket: { id: string; createdAt: string; channelId: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; updatedAt: string; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
  project: null | { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
  executions: { id: string; createdAt: string; status: "queued" | "running" | "ended"; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
  dependencies: { createdAt: string; kind: "depends" | "relates"; ticketId: string; relatedId: string }[];
  subscriptions: { createdAt: string; threadId: string; ticketId: string }[];
  topics: { id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; updatedAt: string; projectId: null | string; title: string; url: null | string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
  triggers: { id: string; at: string; channelId: string; kind: "ci" | "comment" | "open" | "close" | "push"; ref: null | string; text: string; threadId: string; actorName: null | string; human: number; mentioned: number; url: null | string }[];
  inbox: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
};
export type PostApiNexusTicketsidactionResponse = { id: string; createdAt: string; channelId: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; updatedAt: string; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
export type PatchApiNexusProjectsidResponse = { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
export type PostApiNexusProjectsRefreshResponse = { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }[];
export type PatchApiNexusSettingsResponse = { maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
export type PostApiNexusAsksidAnswersResponse = {
  id: string;
  createdAt: string;
  status: "pending" | "done" | "stalled";
  kind: "trigger" | "ticket" | "ask" | "notice";
  seq: number;
  type: "user" | "main" | "project" | "supervisor";
  projectId: null | string;
  supervisorId: null | string;
  origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system";
  title: null | string;
  message: string;
  doneAt: null | string;
  deliveryAttempts: number;
  deliveryError: null | string;
  nextRetryAt: null | string;
  readAt: null | string;
  escalations: number;
  lastEscalatedAt: null | string;
  answer: null | string;
  answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker";
  answeredAt: null | string;
  triggerId: null | string;
  threadId: null | string;
  ticketId: null | string;
  workerId: null | string;
};
export type GetApiNexusSessionsidContextResponse = { text: string; next_offset: null | number; sessionId: string; role: "main" | "project" | "supervisor" | "worker" };
export type GetApiNexusSessionsidMailboxResponse = {
  sessionId: string;
  role: "main" | "project" | "supervisor";
  pendingCount: number;
  messages: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
};
export type PostApiNexusSessionsidMailboxmessageIdHandledResponse = { completed: number };

export interface PostApiNexusTicketsidactionBody {
  reason: string;
}
export interface PatchApiNexusProjectsidBody {
  enabled: false | true;
}
export interface PatchApiNexusSettingsBody {
  maxWorkers?: undefined | number;
  backgroundLimitMinutes?: undefined | number;
  autoMerge?: undefined | false | true;
  autoMergeMaxLines?: undefined | number;
  deliveryMaxAttempts?: undefined | number;
  deliveryRetryCeilingSeconds?: undefined | number;
}
export interface PostApiNexusAsksidAnswersBody {
  answer: string;
}
export interface GetApiNexusTicketsidPath {
  id: string;
}
export interface PostApiNexusTicketsidactionPath {
  id: string;
  action: string;
}
export interface PatchApiNexusProjectsidPath {
  id: string;
}
export interface PostApiNexusAsksidAnswersPath {
  id: string;
}
export interface GetApiNexusSessionsidContextPath {
  id: string;
}
export interface GetApiNexusSessionsidMailboxPath {
  id: string;
}
export interface PostApiNexusSessionsidMailboxmessageIdHandledPath {
  id: string;
  messageId: string;
}
