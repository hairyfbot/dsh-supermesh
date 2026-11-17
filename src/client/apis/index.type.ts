export type GetApiNexusPanelResponse = {
  projects: ({ id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string } & { available?: undefined | false | true })[];
  tickets: { id: string; createdAt: string; channelId: string; updatedAt: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
  mainSessionId: null | string;
  graph: { nodes: ({ id: string; kind: string; label: null | string; status: "queued" | "running" | "ended"; projectId: string; ticketId: string; sessionId: null | string } | { id: string; kind: string; label: string; status: string; projectId: null | string; ticketId: null | string; sessionId: null | string })[]; edges: { source: string; target: string; kind: string }[]; groups: { id: string; label: string; sessionId: null | string; nodeIds: string[] }[] };
  run: { state: string; reason: null | string };
  inbox: {
    pending: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
    resolved: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
    blocked: { id: string; createdAt: string; channelId: string; updatedAt: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string }[];
  };
  topics: { threads: { id: string; createdAt: string; channelId: string; updatedAt: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; url: null | string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[]; triggers: { id: string; at: string; channelId: string; kind: "ci" | "comment" | "open" | "close" | "push"; ref: null | string; text: string; threadId: string; actorName: null | string; human: number; mentioned: number; url: null | string }[]; subscriptions: { createdAt: string; threadId: string; ticketId: string }[] };
  deliveries: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  channels: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] }[];
  settings: { administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
};
export type GetApiNexusTicketsidResponse = {
  ticket: { id: string; createdAt: string; channelId: string; updatedAt: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
  project: null | { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
  executions: { id: string; createdAt: string; status: "queued" | "running" | "ended"; title: null | string; ticketId: string; startedAt: null | string; endedAt: null | string; endedReason: null | "completed" | "stopped" | "failed" | "restarted"; branch: null | string; worktree: null | string; reportState: null | "failed" | "progress" | "ready" | "dropped"; report: null | string; reportAt: null | string; backgroundUntil: null | string; recoveryNote: null | string }[];
  dependencies: { createdAt: string; kind: "depends" | "relates"; ticketId: string; relatedId: string }[];
  subscriptions: { createdAt: string; threadId: string; ticketId: string }[];
  topics: { id: string; createdAt: string; channelId: string; updatedAt: string; kind: "issue" | "pull" | "chat" | "ci"; projectId: null | string; title: string; url: null | string; refId: string; triage: "pending" | "claimed" | "ignored"; triagedAt: null | string }[];
  triggers: { id: string; at: string; channelId: string; kind: "ci" | "comment" | "open" | "close" | "push"; ref: null | string; text: string; threadId: string; actorName: null | string; human: number; mentioned: number; url: null | string }[];
  inbox: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
};
export type PatchApiNexusTicketsidResponse = { id: string; createdAt: string; channelId: string; updatedAt: string; status: "done" | "waiting" | "queued" | "running" | "review" | "cancelled"; description: null | string; projectId: string; title: string; startedAt: null | string; endedAt: null | string; prUrl: null | string; prState: null | "closed" | "open" | "merged"; ciState: null | "pending" | "running" | "passing" | "failing"; paused: number; prepareError: null | string };
export type PutApiNexusChannelsidConfigurationResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type DeleteApiNexusChannelsidCredentialsResponse = { channel: { id: string; kind: "github" | "gitlab" | "feishu"; name: string; host: null | string; enabled: false | true; createdAt: string; configured: false | true; supported: false | true; hasCredential: false | true; status: "online" | "offline" | "unsupported" | "unconfigured" | "disabled"; expectedAccount?: undefined | string; commitName: string; commitEmail: string; accounts: { id: string; channelId: string; role: "bot" | "admin"; name: string; avatar: null | string; status: "online" | "offline"; createdAt: string }[] } };
export type PostApiNexusChannelsidAuthenticationsResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type GetApiNexusChannelsidAuthenticationsauthenticationIdResponse = { id: string; channelId: string; status: "pending" | "failed" | "succeeded"; output: string; verificationUri?: undefined | string; userCode?: undefined | string; error?: undefined | string; account?: undefined | { login: string } };
export type PatchApiNexusProjectsidResponse = { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string };
export type PostApiNexusProjectsResponse = { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }[];
export type PostApiNexusRepositoriesResponse = { project: { id: string; name: string; enabled: number; createdAt: string; updatedAt: string; workspaceId: string; directory: string; remoteUrl: null | string; orchestratorSessionId: null | string }; workspaceId: string };
export type PutApiNexusProjectsidSessionResponse = { sessionId: string };
export type PostApiNexusProjectsidOpeningsResponse = { opened: true };
export type PutApiNexusSessionsMainResponse = { sessionId: string };
export type PatchApiNexusSettingsResponse = { administrators: string[]; maxWorkers: number; backgroundLimitMinutes: number; autoMerge: false | true; autoMergeMaxLines: number; deliveryMaxAttempts: number; deliveryRetryCeilingSeconds: number; updatedAt: string };
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
export type GetApiNexusSessionsidContextResponse = { text: string; next_offset: null | number; sessionId: string; role: "main" | "project" | "supervisor" | "worker"; pendingCount: number };
export type GetApiNexusSessionsidMailboxResponse = {
  mailbox: null | {
    sessionId: string;
    role: "main" | "project" | "supervisor";
    projects: { id: string; name: string; directory: string; remoteUrl: null | string }[];
    pendingCount: number;
    messages: { id: string; createdAt: string; status: "pending" | "done" | "stalled"; kind: "trigger" | "ticket" | "ask" | "notice"; seq: number; type: "user" | "main" | "project" | "supervisor"; projectId: null | string; supervisorId: null | string; origin: "main" | "project" | "supervisor" | "channel" | "worker" | "system"; title: null | string; message: string; doneAt: null | string; deliveryAttempts: number; deliveryError: null | string; nextRetryAt: null | string; readAt: null | string; escalations: number; lastEscalatedAt: null | string; answer: null | string; answeredBy: null | "user" | "main" | "project" | "supervisor" | "worker"; answeredAt: null | string; triggerId: null | string; threadId: null | string; ticketId: null | string; workerId: null | string }[];
  };
};
export type PatchApiNexusSessionsidMailboxmessageIdResponse = { completed: number };

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
  administrators?: undefined | string[];
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
