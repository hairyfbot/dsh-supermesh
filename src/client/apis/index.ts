/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type * as Types from "./index.type";

/** @method get */
export async function getApiSupermeshProject(config?: RequestInit) {
  const response = await fetch("/api/supermesh/project", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshProjectResponse>;
}

/** @method post */
export async function postApiSupermeshProject(config?: RequestInit) {
  const response = await fetch("/api/supermesh/project", {
    method: "POST",
    ...config,
  });
  return response.json() as Promise<Types.PostApiSupermeshProjectResponse>;
}

/** @method patch */
export async function patchApiSupermeshProjectId(paths: Types.PatchApiSupermeshProjectidPath, body: Types.PatchApiSupermeshProjectidBody, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/project/${paths.id}`, {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiSupermeshProjectidResponse>;
}

/** @method put */
export async function putApiSupermeshProjectIdSession(paths: Types.PutApiSupermeshProjectidSessionPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/project/${paths.id}/session`, {
    method: "PUT",
    ...config,
  });
  return response.json() as Promise<Types.PutApiSupermeshProjectidSessionResponse>;
}

/** @method post */
export async function postApiSupermeshProjectIdOpening(paths: Types.PostApiSupermeshProjectidOpeningPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/project/${paths.id}/opening`, {
    method: "POST",
    ...config,
  });
  return response.json() as Promise<Types.PostApiSupermeshProjectidOpeningResponse>;
}

/** @method post */
export async function postApiSupermeshRepository(body: Types.PostApiSupermeshRepositoryBody, config?: RequestInit) {
  const response = await fetch("/api/supermesh/repository", {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiSupermeshRepositoryResponse>;
}

/** @method get */
export async function getApiSupermeshTicket(config?: RequestInit) {
  const response = await fetch("/api/supermesh/ticket", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshTicketResponse>;
}

/** @method get */
export async function getApiSupermeshTicketCurrent(config?: RequestInit) {
  const response = await fetch("/api/supermesh/ticket/current", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshTicketCurrentResponse>;
}

/** @method get */
export async function getApiSupermeshTicketId(paths: Types.GetApiSupermeshTicketidPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/ticket/${paths.id}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshTicketidResponse>;
}

/** @method patch */
export async function patchApiSupermeshTicketId(paths: Types.PatchApiSupermeshTicketidPath, body: Types.PatchApiSupermeshTicketidBody, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/ticket/${paths.id}`, {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiSupermeshTicketidResponse>;
}

/** @method post */
export async function postApiSupermeshAskIdAnswer(paths: Types.PostApiSupermeshAskidAnswerPath, body: Types.PostApiSupermeshAskidAnswerBody, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/ask/${paths.id}/answer`, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiSupermeshAskidAnswerResponse>;
}

/** @method get */
export async function getApiSupermeshWorker(config?: RequestInit) {
  const response = await fetch("/api/supermesh/worker", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshWorkerResponse>;
}

/** @method get */
export async function getApiSupermeshSupervisor(config?: RequestInit) {
  const response = await fetch("/api/supermesh/supervisor", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshSupervisorResponse>;
}

/** @method get */
export async function getApiSupermeshScope(config?: RequestInit) {
  const response = await fetch("/api/supermesh/scope", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshScopeResponse>;
}

/** @method get */
export async function getApiSupermeshNode(config?: RequestInit) {
  const response = await fetch("/api/supermesh/node", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshNodeResponse>;
}

/** @method get */
export async function getApiSupermeshEdge(config?: RequestInit) {
  const response = await fetch("/api/supermesh/edge", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshEdgeResponse>;
}

/** @method get */
export async function getApiSupermeshGroup(config?: RequestInit) {
  const response = await fetch("/api/supermesh/group", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshGroupResponse>;
}

/** @method get */
export async function getApiSupermeshStatus(config?: RequestInit) {
  const response = await fetch("/api/supermesh/status", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshStatusResponse>;
}

/** @method get */
export async function getApiSupermeshMessage(config?: RequestInit) {
  const response = await fetch("/api/supermesh/message", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshMessageResponse>;
}

/** @method get */
export async function getApiSupermeshPending(config?: RequestInit) {
  const response = await fetch("/api/supermesh/pending", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshPendingResponse>;
}

/** @method get */
export async function getApiSupermeshDelivery(config?: RequestInit) {
  const response = await fetch("/api/supermesh/delivery", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshDeliveryResponse>;
}

/** @method get */
export async function getApiSupermeshThread(config?: RequestInit) {
  const response = await fetch("/api/supermesh/thread", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshThreadResponse>;
}

/** @method get */
export async function getApiSupermeshTrigger(config?: RequestInit) {
  const response = await fetch("/api/supermesh/trigger", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshTriggerResponse>;
}

/** @method get */
export async function getApiSupermeshSubscription(config?: RequestInit) {
  const response = await fetch("/api/supermesh/subscription", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshSubscriptionResponse>;
}

/** @method get */
export async function getApiSupermeshChannel(config?: RequestInit) {
  const response = await fetch("/api/supermesh/channel", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshChannelResponse>;
}

/** @method put */
export async function putApiSupermeshChannelIdConfiguration(paths: Types.PutApiSupermeshChannelidConfigurationPath, body: Types.PutApiSupermeshChannelidConfigurationBody, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/channel/${paths.id}/configuration`, {
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PutApiSupermeshChannelidConfigurationResponse>;
}

/** @method delete */
export async function deleteApiSupermeshChannelIdCredential(paths: Types.DeleteApiSupermeshChannelidCredentialPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/channel/${paths.id}/credential`, {
    method: "DELETE",
    ...config,
  });
  return response.json() as Promise<Types.DeleteApiSupermeshChannelidCredentialResponse>;
}

/** @method post */
export async function postApiSupermeshChannelIdAuthentication(paths: Types.PostApiSupermeshChannelidAuthenticationPath, body: Types.PostApiSupermeshChannelidAuthenticationBody, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/channel/${paths.id}/authentication`, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiSupermeshChannelidAuthenticationResponse>;
}

/** @method get */
export async function getApiSupermeshChannelIdAuthenticationAuthenticationId(paths: Types.GetApiSupermeshChannelidAuthenticationauthenticationIdPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/channel/${paths.id}/authentication/${paths.authenticationId}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshChannelidAuthenticationauthenticationIdResponse>;
}

/** @method get */
export async function getApiSupermeshSetting(config?: RequestInit) {
  const response = await fetch("/api/supermesh/setting", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshSettingResponse>;
}

/** @method patch */
export async function patchApiSupermeshSetting(body: Types.PatchApiSupermeshSettingBody, config?: RequestInit) {
  const response = await fetch("/api/supermesh/setting", {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiSupermeshSettingResponse>;
}

/** @method get */
export async function getApiSupermeshAgentModel(config?: RequestInit) {
  const response = await fetch("/api/supermesh/agent/model", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshAgentModelResponse>;
}

/** @method patch */
export async function patchApiSupermeshAgentModel(body: Types.PatchApiSupermeshAgentModelBody, config?: RequestInit) {
  const response = await fetch("/api/supermesh/agent/model", {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiSupermeshAgentModelResponse>;
}

/** @method get */
export async function getApiSupermeshAgentModelCatalog(config?: RequestInit) {
  const response = await fetch("/api/supermesh/agent/model/catalog", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshAgentModelCatalogResponse>;
}

/** @method put */
export async function putApiSupermeshSessionMain(config?: RequestInit) {
  const response = await fetch("/api/supermesh/session/main", {
    method: "PUT",
    ...config,
  });
  return response.json() as Promise<Types.PutApiSupermeshSessionMainResponse>;
}

/** @method get */
export async function getApiSupermeshSessionRole(config?: RequestInit) {
  const response = await fetch("/api/supermesh/session/role", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshSessionRoleResponse>;
}

/** @method get */
export async function getApiSupermeshSessionIdContext(paths: Types.GetApiSupermeshSessionidContextPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/session/${paths.id}/context`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshSessionidContextResponse>;
}

/** @method get */
export async function getApiSupermeshSessionIdMailbox(paths: Types.GetApiSupermeshSessionidMailboxPath, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/session/${paths.id}/mailbox`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiSupermeshSessionidMailboxResponse>;
}

/** @method patch */
export async function patchApiSupermeshSessionIdMailboxMessageId(paths: Types.PatchApiSupermeshSessionidMailboxmessageIdPath, body: Types.PatchApiSupermeshSessionidMailboxmessageIdBody, config?: RequestInit) {
  const response = await fetch(`/api/supermesh/session/${paths.id}/mailbox/${paths.messageId}`, {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiSupermeshSessionidMailboxmessageIdResponse>;
}
