export type GetApiNexusProjectResponse = { session: { sessionId: null | string; status: "queued" | "running" | "idle" | "background" | "not_created" }; updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string; available?: undefined | false | true }[];
export type PostApiNexusProjectResponse = { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }[];
export type PatchApiNexusProjectidResponse = { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
export type PutApiNexusProjectidSessionResponse = { sessionId: string };
export type PostApiNexusProjectidOpeningResponse = { opened: true };
export type PostApiNexusRepositoryResponse = { project: { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }; workspaceId: string };
export type GetApiNexusTicketResponse = { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
export type GetApiNexusTicketCurrentResponse = { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
export type GetApiNexusTicketidResponse = {
  ticket: { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
  project: null | { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
  executions: { status: "queued" | "running" | "ended"; id: string; createdAt: string; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
  dependencies: { createdAt: string; kind: "depends" | "relates"; ticketId: string; relatedId: string }[];
  subscriptions: { createdAt: string; threadId: string; ticketId: string }[];
  topics: { updatedAt: string; url: null | string; id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
  triggers: { at: string; url: null | string; text: string; id: string; channelId: string; kind: "push" | "ci" | "comment" | "open" | "close"; ref: null | string; threadId: string; actorName: null | string; human: number; mentioned: number }[];
  inbox: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
};
export type PatchApiNexusTicketidResponse = { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
export type PostApiNexusAskidAnswerResponse = {
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
export type GetApiNexusWorkerResponse = { status: "queued" | "running" | "ended"; id: string; createdAt: string; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
export type GetApiNexusSupervisorResponse = { status: "active" | "closed"; id: string; createdAt: string; title: string; sessionId: null | string; reason: string; closedAt: null | string }[];
export type GetApiNexusScopeResponse = { createdAt: string; supervisorId: string; ticketId: string }[];
export type GetApiNexusNodeResponse = ({ id: string; kind: string; label: null | string; status: "queued" | "running" | "ended"; projectId: string; ticketId: string; sessionId: null | string } | { id: string; kind: string; label: string; status: string; projectId: null | string; ticketId: null | string; sessionId: null | string })[];
export type GetApiNexusEdgeResponse = { source: string; target: string; kind: string }[];
export type GetApiNexusGroupResponse = { id: string; label: string; sessionId: null | string; nodeIds: string[] }[];
export type GetApiNexusStatusResponse = { state: string; reason: null | string };
export type GetApiNexusMessageResponse = {
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
}[];
export type GetApiNexusPendingResponse = {
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
}[];
export type GetApiNexusDeliveryResponse = {
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
}[];
export type GetApiNexusThreadResponse = { updatedAt: string; url: null | string; id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
export type GetApiNexusTriggerResponse = { at: string; url: null | string; text: string; id: string; channelId: string; kind: "push" | "ci" | "comment" | "open" | "close"; ref: null | string; threadId: string; actorName: null | string; human: number; mentioned: number }[];
export type GetApiNexusSubscriptionResponse = { createdAt: string; threadId: string; ticketId: string }[];
export type GetApiNexusChannelResponse = { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] }[];
export type PutApiNexusChannelidConfigurationResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type DeleteApiNexusChannelidCredentialResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type PostApiNexusChannelidAuthenticationResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type GetApiNexusChannelidAuthenticationauthenticationIdResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type GetApiNexusSettingResponse = { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } }; administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; autoArchiveWorkers: false | true; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
export type PatchApiNexusSettingResponse = { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } }; administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; autoArchiveWorkers: false | true; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
export type GetApiNexusAgentModelResponse = { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } };
export type PatchApiNexusAgentModelResponse = { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } };
export type GetApiNexusAgentModelCatalogResponse = { default: { provider: string; model: string; reasoningEffort?: undefined | string }; routableProviders: string[]; groups: { id: string; name: string; models: { id: string; name: string; description?: undefined | string; reasoning?: undefined | { efforts: { id: string; name: string; description?: undefined | string }[]; defaultEffort?: undefined | string }; badge?: undefined | { text: string | { en: string; [key: string]: string }; tone: "neutral" | "info" | "success" | "warning" } }[] }[]; failures: { id: string; name: string; message: string }[] };
export type PutApiNexusSessionMainResponse = { sessionId: string };
export type GetApiNexusSessionRoleResponse = { sessions: ({ sessionId: string; role: "project" } | { sessionId: string; role: "supervisor" } | { sessionId: string; role: "worker" } | { sessionId: string; role: "main" })[] };
export type GetApiNexusSessionidContextResponse = { text: string; next_offset: null | number; sessionId: string; role: "main" | "project" | "worker" | "supervisor"; pendingCount: number };
export type GetApiNexusSessionidMailboxResponse = {
  mailbox: null | {
    sessionId: string;
    role: "main" | "project" | "supervisor";
    projects: { id: string; name: string; directory: string; remoteUrl: null | string }[];
    pendingCount: number;
    messages: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  };
};
export type PatchApiNexusSessionidMailboxmessageIdResponse = { completed: number };

export interface PatchApiNexusProjectidBody {
  enabled: false | true;
}
export interface PostApiNexusRepositoryBody {
  remoteUrl: string;
  name?: undefined | string;
}
export interface PatchApiNexusTicketidBody {
  paused: false | true;
  reason: string;
}
export interface PostApiNexusAskidAnswerBody {
  answer: string;
}
export interface PutApiNexusChannelidConfigurationBody {
  host?: undefined | string;
  expectedAccount?: undefined | string;
  enabled?: undefined | false | true;
  commitName?: undefined | string;
  commitEmail?: undefined | string;
  token?: undefined | string;
}
export interface PostApiNexusChannelidAuthenticationBody {
  host?: undefined | string;
}
export interface PatchApiNexusSettingBody {
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
export interface PatchApiNexusAgentModelBody {
  role: "main" | "manager" | "project" | "worker" | "supervisor";
  provider: string;
  model: string;
  reasoningEffort?: undefined | string;
}
export interface PatchApiNexusSessionidMailboxmessageIdBody {
  status: "done";
}
export interface PatchApiNexusProjectidPath {
  id: string;
}
export interface PutApiNexusProjectidSessionPath {
  id: string;
}
export interface PostApiNexusProjectidOpeningPath {
  id: string;
}
export interface GetApiNexusTicketidPath {
  id: string;
}
export interface PatchApiNexusTicketidPath {
  id: string;
}
export interface PostApiNexusAskidAnswerPath {
  id: string;
}
export interface PutApiNexusChannelidConfigurationPath {
  id: string;
}
export interface DeleteApiNexusChannelidCredentialPath {
  id: string;
}
export interface PostApiNexusChannelidAuthenticationPath {
  id: string;
}
export interface GetApiNexusChannelidAuthenticationauthenticationIdPath {
  id: string;
  authenticationId: string;
}
export interface GetApiNexusSessionidContextPath {
  id: string;
}
export interface GetApiNexusSessionidMailboxPath {
  id: string;
}
export interface PatchApiNexusSessionidMailboxmessageIdPath {
  id: string;
  messageId: string;
}
