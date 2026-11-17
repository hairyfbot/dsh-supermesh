export type GetApiNexusPanelResponse = {
  projects: ({ updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string } & { available?: undefined | false | true })[];
  tickets: { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
  mainSessionId: null | string;
  graph: { nodes: ({ id: string; kind: string; label: null | string; status: "queued" | "running" | "ended"; projectId: string; ticketId: string; sessionId: null | string } | { id: string; kind: string; label: string; status: string; projectId: null | string; ticketId: null | string; sessionId: null | string })[]; edges: { source: string; target: string; kind: string }[]; groups: { id: string; label: string; sessionId: null | string; nodeIds: string[] }[] };
  run: { state: string; reason: null | string };
  inbox: {
    pending: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
    resolved: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
    blocked: { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
  };
  topics: { threads: { updatedAt: string; url: null | string; id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[]; triggers: { at: string; url: null | string; text: string; id: string; channelId: string; kind: "push" | "ci" | "comment" | "open" | "close"; ref: null | string; threadId: string; actorName: null | string; human: number; mentioned: number }[]; subscriptions: { createdAt: string; threadId: string; ticketId: string }[] };
  deliveries: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  channels: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] }[];
  settings: { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } }; administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; autoArchiveWorkers: false | true; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
};
export type GetApiNexusAgentsModelsResponse = {
  models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } };
  catalog: { default: { provider: string; model: string; reasoningEffort?: undefined | string }; routableProviders: string[]; groups: { id: string; name: string; models: { id: string; name: string; description?: undefined | string; reasoning?: undefined | { efforts: { id: string; name: string; description?: undefined | string }[]; defaultEffort?: undefined | string }; badge?: undefined | { text: string | { en: string; [key: string]: string }; tone: "neutral" | "info" | "success" | "warning" } }[] }[]; failures: { id: string; name: string; message: string }[] };
};
export type PatchApiNexusAgentsModelsResponse = { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } } };
export type GetApiNexusTicketsidResponse = {
  ticket: { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
  project: null | { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
  executions: { status: "queued" | "running" | "ended"; id: string; createdAt: string; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
  dependencies: { createdAt: string; kind: "depends" | "relates"; ticketId: string; relatedId: string }[];
  subscriptions: { createdAt: string; threadId: string; ticketId: string }[];
  topics: { updatedAt: string; url: null | string; id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
  triggers: { at: string; url: null | string; text: string; id: string; channelId: string; kind: "push" | "ci" | "comment" | "open" | "close"; ref: null | string; threadId: string; actorName: null | string; human: number; mentioned: number }[];
  inbox: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
};
export type PatchApiNexusTicketsidResponse = { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
export type PutApiNexusChannelsidConfigurationResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type DeleteApiNexusChannelsidCredentialsResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type PostApiNexusChannelsidAuthenticationsResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type GetApiNexusChannelsidAuthenticationsauthenticationIdResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type PatchApiNexusProjectsidResponse = { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
export type PostApiNexusProjectsResponse = { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }[];
export type PostApiNexusRepositoriesResponse = { project: { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }; workspaceId: string };
export type PutApiNexusProjectsidSessionResponse = { sessionId: string };
export type PostApiNexusProjectsidOpeningsResponse = { opened: true };
export type PutApiNexusSessionsMainResponse = { sessionId: string };
export type PatchApiNexusSettingsResponse = { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } }; administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; autoArchiveWorkers: false | true; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
export type PostApiNexusAsksidAnswersResponse = {
  status: "pending" | "done" | "stalled";
  message: string;
  id: string;
  createdAt: string;
  kind: "trigger" | "ticket" | "ask" | "notice";
  seq: number;
  type: "main" | "project" | "supervisor" | "user";
  projectId: null | string;
  supervisorId: null | string;
  origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system";
  title: null | string;
  doneAt: null | string;
  deliveryAttempts: number;
  deliveryError: null | string;
  nextRetryAt: null | string;
  readAt: null | string;
  escalations: number;
  lastEscalatedAt: null | string;
  answer: null | string;
  answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user";
  answeredAt: null | string;
  triggerId: null | string;
  threadId: null | string;
  ticketId: null | string;
  workerId: null | string;
};
export type GetApiNexusSessionsidContextResponse = { text: string; next_offset: null | number; sessionId: string; role: "main" | "project" | "worker" | "supervisor"; pendingCount: number };
export type GetApiNexusSessionsidMailboxResponse = {
  mailbox: null | {
    sessionId: string;
    role: "main" | "project" | "supervisor";
    projects: { id: string; name: string; directory: string; remoteUrl: null | string }[];
    pendingCount: number;
    messages: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  };
};
export type PatchApiNexusSessionsidMailboxmessageIdResponse = { completed: number };

export interface PatchApiNexusAgentsModelsBody {
  role: "main" | "manager" | "project" | "worker" | "supervisor";
  provider: string;
  model: string;
  reasoningEffort?: undefined | string;
}
export interface PatchApiNexusTicketsidBody {
  paused: false | true;
  reason: string;
}
export interface PutApiNexusChannelsidConfigurationBody {
  host?: undefined | string;
  expectedAccount?: undefined | string;
  enabled?: undefined | false | true;
  commitName?: undefined | string;
  commitEmail?: undefined | string;
  token?: undefined | string;
}
export interface PostApiNexusChannelsidAuthenticationsBody {
  host?: undefined | string;
}
export interface PatchApiNexusProjectsidBody {
  enabled: false | true;
}
export interface PostApiNexusRepositoriesBody {
  remoteUrl: string;
  name?: undefined | string;
}
export interface PatchApiNexusSettingsBody {
  models?: undefined | { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } };
  administrators?: undefined | string[];
  maxWorkers?: undefined | number;
  backgroundLimitMinutes?: undefined | number;
  autoMerge?: undefined | false | true;
  autoMergeMaxLines?: undefined | number;
  autoArchiveWorkers?: undefined | false | true;
  deliveryMaxAttempts?: undefined | number;
  deliveryRetryCeilingSeconds?: undefined | number;
}
export interface PostApiNexusAsksidAnswersBody {
  answer: string;
}
export interface PatchApiNexusSessionsidMailboxmessageIdBody {
  status: "done";
}
export interface GetApiNexusTicketsidPath {
  id: string;
}
export interface PatchApiNexusTicketsidPath {
  id: string;
}
export interface PutApiNexusChannelsidConfigurationPath {
  id: string;
}
export interface DeleteApiNexusChannelsidCredentialsPath {
  id: string;
}
export interface PostApiNexusChannelsidAuthenticationsPath {
  id: string;
}
export interface GetApiNexusChannelsidAuthenticationsauthenticationIdPath {
  id: string;
  authenticationId: string;
}
export interface PatchApiNexusProjectsidPath {
  id: string;
}
export interface PutApiNexusProjectsidSessionPath {
  id: string;
}
export interface PostApiNexusProjectsidOpeningsPath {
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
export interface PatchApiNexusSessionsidMailboxmessageIdPath {
  id: string;
  messageId: string;
}
