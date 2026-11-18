export type GetApiSupermeshProjectResponse = { session: { sessionId: null | string; status: "queued" | "running" | "idle" | "background" | "not_created" }; updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string; available?: undefined | false | true }[];
export type PostApiSupermeshProjectResponse = { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }[];
export type PatchApiSupermeshProjectidResponse = { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
export type PutApiSupermeshProjectidSessionResponse = { sessionId: string };
export type PostApiSupermeshProjectidOpeningResponse = { opened: true };
export type PostApiSupermeshRepositoryResponse = { project: { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }; workspaceId: string };
export type GetApiSupermeshTicketResponse = { data: { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[]; total: number; page: number; pageSize: number };
export type GetApiSupermeshTicketQueryPage = undefined | string;
export type GetApiSupermeshTicketQueryPageSize = undefined | string;
export type GetApiSupermeshTicketCurrentResponse = { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
export type GetApiSupermeshTicketidResponse = {
  ticket: { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
  project: null | { updatedAt: string; name: string; id: string; enabled: number; createdAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
  executions: { status: "queued" | "running" | "ended"; id: string; createdAt: string; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
  dependencies: { createdAt: string; kind: "depends" | "relates"; ticketId: string; relatedId: string }[];
  subscriptions: { createdAt: string; threadId: string; ticketId: string }[];
  topics: { updatedAt: string; url: null | string; id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
  triggers: { at: string; url: null | string; text: string; id: string; channelId: string; kind: "push" | "ci" | "comment" | "open" | "close"; ref: null | string; threadId: string; actorName: null | string; human: number; mentioned: number }[];
  inbox: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
};
export type PatchApiSupermeshTicketidResponse = { updatedAt: string; description: null | string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; id: string; createdAt: string; channelId: string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
export type PostApiSupermeshAskidAnswerResponse = {
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
export type GetApiSupermeshWorkerResponse = { status: "queued" | "running" | "ended"; id: string; createdAt: string; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
export type GetApiSupermeshSupervisorResponse = { status: "active" | "closed"; id: string; createdAt: string; title: string; sessionId: null | string; reason: string; closedAt: null | string }[];
export type GetApiSupermeshScopeResponse = { createdAt: string; supervisorId: string; ticketId: string }[];
export type GetApiSupermeshNodeResponse = ({ id: string; kind: string; label: null | string; status: "queued" | "running" | "ended"; projectId: string; ticketId: string; sessionId: null | string } | { id: string; kind: string; label: string; status: string; projectId: null | string; ticketId: null | string; sessionId: null | string })[];
export type GetApiSupermeshEdgeResponse = { source: string; target: string; kind: string }[];
export type GetApiSupermeshGroupResponse = { id: string; label: string; sessionId: null | string; nodeIds: string[] }[];
export type GetApiSupermeshStatusResponse = { state: string; reason: null | string };
export type GetApiSupermeshMessageResponse = {
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
export type GetApiSupermeshPendingResponse = {
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
export type GetApiSupermeshDeliveryResponse = {
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
export type GetApiSupermeshThreadResponse = { updatedAt: string; url: null | string; id: string; createdAt: string; channelId: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
export type GetApiSupermeshTriggerResponse = { at: string; url: null | string; text: string; id: string; channelId: string; kind: "push" | "ci" | "comment" | "open" | "close"; ref: null | string; threadId: string; actorName: null | string; human: number; mentioned: number }[];
export type GetApiSupermeshTopicResponse = {
  data: {
    latest: { id: string; channel: string; kind: "push" | "ci" | "comment" | "open" | "close"; actor: string; human: false | true; mentioned: false | true; text: string; at: string; ref?: undefined | string; url?: undefined | string; thread: { id: string; kind: "issue" | "pull" | "chat" | "ci"; ref: string; title: string; triage: "pending" | "claimed" | "ignored"; project?: undefined | string; url?: undefined | string }; tickets: string[]; deliveries: { target: "main" | "project" | "supervisor" | "user"; project?: undefined | string; status: "pending" | "done" | "stalled"; read: false | true; attempts?: undefined | number; error?: undefined | string }[] };
    events: { id: string; channel: string; kind: "push" | "ci" | "comment" | "open" | "close"; actor: string; human: false | true; mentioned: false | true; text: string; at: string; ref?: undefined | string; url?: undefined | string; thread: { id: string; kind: "issue" | "pull" | "chat" | "ci"; ref: string; title: string; triage: "pending" | "claimed" | "ignored"; project?: undefined | string; url?: undefined | string }; tickets: string[]; deliveries: { target: "main" | "project" | "supervisor" | "user"; project?: undefined | string; status: "pending" | "done" | "stalled"; read: false | true; attempts?: undefined | number; error?: undefined | string }[] }[];
  }[];
  total: number;
  page: number;
  pageSize: number;
};
export type GetApiSupermeshTopicQueryPage = undefined | string;
export type GetApiSupermeshTopicQueryPageSize = undefined | string;
export type GetApiSupermeshTopicQueryQuery = undefined | string;
export type GetApiSupermeshTopicQueryChannel = undefined | string;
export type GetApiSupermeshTopicQueryStatus = undefined | string;
export type GetApiSupermeshTopicQueryKind = undefined | string;
export type GetApiSupermeshTopicQueryMentionedOnly = undefined | string;
export type GetApiSupermeshSubscriptionResponse = { createdAt: string; threadId: string; ticketId: string }[];
export type GetApiSupermeshChannelResponse = { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] }[];
export type PutApiSupermeshChannelidConfigurationResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type DeleteApiSupermeshChannelidCredentialResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type PostApiSupermeshChannelidAuthenticationResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type GetApiSupermeshChannelidAuthenticationauthenticationIdResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type GetApiSupermeshSettingResponse = { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } }; administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; autoArchiveWorkers: false | true; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
export type PatchApiSupermeshSettingResponse = { models: { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } }; administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; autoArchiveWorkers: false | true; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
export type GetApiSupermeshAgentModelResponse = { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } };
export type PatchApiSupermeshAgentModelResponse = { main: null | { provider: string; model: string; reasoningEffort?: undefined | string }; manager: null | { provider: string; model: string; reasoningEffort?: undefined | string }; project: null | { provider: string; model: string; reasoningEffort?: undefined | string }; worker: null | { provider: string; model: string; reasoningEffort?: undefined | string }; supervisor: null | { provider: string; model: string; reasoningEffort?: undefined | string } };
export type GetApiSupermeshAgentModelCatalogResponse = { default: { provider: string; model: string; reasoningEffort?: undefined | string }; routableProviders: string[]; groups: { id: string; name: string; models: { id: string; name: string; description?: undefined | string; reasoning?: undefined | { efforts: { id: string; name: string; description?: undefined | string }[]; defaultEffort?: undefined | string }; badge?: undefined | { text: string | { en: string; [key: string]: string }; tone: "neutral" | "info" | "success" | "warning" } }[] }[]; failures: { id: string; name: string; message: string }[] };
export type PutApiSupermeshSessionMainResponse = { sessionId: string };
export type GetApiSupermeshSessionRoleResponse = { sessions: ({ sessionId: string; role: "project" } | { sessionId: string; role: "supervisor" } | { sessionId: string; role: "worker" } | { sessionId: string; role: "main" })[] };
export type GetApiSupermeshSessionidContextResponse = { text: string; next_offset: null | number; sessionId: string; role: "main" | "project" | "worker" | "supervisor"; pendingCount: number };
export type GetApiSupermeshSessionidMailboxResponse = {
  mailbox: null | {
    sessionId: string;
    role: "main" | "project" | "supervisor";
    projects: { id: string; name: string; directory: string; remoteUrl: null | string }[];
    pendingCount: number;
    messages: { status: "pending" | "done" | "stalled"; message: string; id: string; createdAt: string; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "main" | "project" | "supervisor" | "user"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "worker" | "supervisor" | "channel" | "system"; title: null | string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "main" | "project" | "worker" | "supervisor" | "user"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  };
};
export type PatchApiSupermeshSessionidMailboxmessageIdResponse = { completed: number };

export interface PatchApiSupermeshProjectidBody {
  enabled: false | true;
}
export interface PostApiSupermeshRepositoryBody {
  remoteUrl: string;
  name?: undefined | string;
}
export interface PatchApiSupermeshTicketidBody {
  paused: false | true;
  reason: string;
}
export interface PostApiSupermeshAskidAnswerBody {
  answer: string;
}
export interface PutApiSupermeshChannelidConfigurationBody {
  host?: undefined | string;
  expectedAccount?: undefined | string;
  enabled?: undefined | false | true;
  commitName?: undefined | string;
  commitEmail?: undefined | string;
  token?: undefined | string;
}
export interface PostApiSupermeshChannelidAuthenticationBody {
  host?: undefined | string;
}
export interface PatchApiSupermeshSettingBody {
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
export interface PatchApiSupermeshAgentModelBody {
  role: "main" | "manager" | "project" | "worker" | "supervisor";
  provider: string;
  model: string;
  reasoningEffort?: undefined | string;
}
export interface PatchApiSupermeshSessionidMailboxmessageIdBody {
  status: "done";
}
export interface PatchApiSupermeshProjectidPath {
  id: string;
}
export interface PutApiSupermeshProjectidSessionPath {
  id: string;
}
export interface PostApiSupermeshProjectidOpeningPath {
  id: string;
}
export interface GetApiSupermeshTicketQuery {
  page?: GetApiSupermeshTicketQueryPage;
  pageSize?: GetApiSupermeshTicketQueryPageSize;
}
export interface GetApiSupermeshTicketidPath {
  id: string;
}
export interface PatchApiSupermeshTicketidPath {
  id: string;
}
export interface PostApiSupermeshAskidAnswerPath {
  id: string;
}
export interface GetApiSupermeshTopicQuery {
  page?: GetApiSupermeshTopicQueryPage;
  pageSize?: GetApiSupermeshTopicQueryPageSize;
  query?: GetApiSupermeshTopicQueryQuery;
  channel?: GetApiSupermeshTopicQueryChannel;
  status?: GetApiSupermeshTopicQueryStatus;
  kind?: GetApiSupermeshTopicQueryKind;
  mentionedOnly?: GetApiSupermeshTopicQueryMentionedOnly;
}
export interface PutApiSupermeshChannelidConfigurationPath {
  id: string;
}
export interface DeleteApiSupermeshChannelidCredentialPath {
  id: string;
}
export interface PostApiSupermeshChannelidAuthenticationPath {
  id: string;
}
export interface GetApiSupermeshChannelidAuthenticationauthenticationIdPath {
  id: string;
  authenticationId: string;
}
export interface GetApiSupermeshSessionidContextPath {
  id: string;
}
export interface GetApiSupermeshSessionidMailboxPath {
  id: string;
}
export interface PatchApiSupermeshSessionidMailboxmessageIdPath {
  id: string;
  messageId: string;
}
