/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type * as Types from "./index.type";

/** @method get */
export async function getApiNexusProject(config?: RequestInit) {
  const response = await fetch("/api/nexus/project", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusProjectResponse>;
}

/** @method post */
export async function postApiNexusProject(config?: RequestInit) {
  const response = await fetch("/api/nexus/project", {
    method: "POST",
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusProjectResponse>;
}

/** @method patch */
export async function patchApiNexusProjectId(paths: Types.PatchApiNexusProjectidPath, body: Types.PatchApiNexusProjectidBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/project/${paths.id}`, {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusProjectidResponse>;
}

/** @method put */
export async function putApiNexusProjectIdSession(paths: Types.PutApiNexusProjectidSessionPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/project/${paths.id}/session`, {
    method: "PUT",
    ...config,
  });
  return response.json() as Promise<Types.PutApiNexusProjectidSessionResponse>;
}

/** @method post */
export async function postApiNexusProjectIdOpening(paths: Types.PostApiNexusProjectidOpeningPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/project/${paths.id}/opening`, {
    method: "POST",
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusProjectidOpeningResponse>;
}

/** @method post */
export async function postApiNexusRepository(body: Types.PostApiNexusRepositoryBody, config?: RequestInit) {
  const response = await fetch("/api/nexus/repository", {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusRepositoryResponse>;
}

/** @method get */
export async function getApiNexusTicket(config?: RequestInit) {
  const response = await fetch("/api/nexus/ticket", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusTicketResponse>;
}

/** @method get */
export async function getApiNexusTicketCurrent(config?: RequestInit) {
  const response = await fetch("/api/nexus/ticket/current", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusTicketCurrentResponse>;
}

/** @method get */
export async function getApiNexusTicketId(paths: Types.GetApiNexusTicketidPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/ticket/${paths.id}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusTicketidResponse>;
}

/** @method patch */
export async function patchApiNexusTicketId(paths: Types.PatchApiNexusTicketidPath, body: Types.PatchApiNexusTicketidBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/ticket/${paths.id}`, {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusTicketidResponse>;
}

/** @method post */
export async function postApiNexusAskIdAnswer(paths: Types.PostApiNexusAskidAnswerPath, body: Types.PostApiNexusAskidAnswerBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/ask/${paths.id}/answer`, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusAskidAnswerResponse>;
}

/** @method get */
export async function getApiNexusWorker(config?: RequestInit) {
  const response = await fetch("/api/nexus/worker", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusWorkerResponse>;
}

/** @method get */
export async function getApiNexusSupervisor(config?: RequestInit) {
  const response = await fetch("/api/nexus/supervisor", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSupervisorResponse>;
}

/** @method get */
export async function getApiNexusScope(config?: RequestInit) {
  const response = await fetch("/api/nexus/scope", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusScopeResponse>;
}

/** @method get */
export async function getApiNexusNode(config?: RequestInit) {
  const response = await fetch("/api/nexus/node", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusNodeResponse>;
}

/** @method get */
export async function getApiNexusEdge(config?: RequestInit) {
  const response = await fetch("/api/nexus/edge", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusEdgeResponse>;
}

/** @method get */
export async function getApiNexusGroup(config?: RequestInit) {
  const response = await fetch("/api/nexus/group", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusGroupResponse>;
}

/** @method get */
export async function getApiNexusStatus(config?: RequestInit) {
  const response = await fetch("/api/nexus/status", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusStatusResponse>;
}

/** @method get */
export async function getApiNexusMessage(config?: RequestInit) {
  const response = await fetch("/api/nexus/message", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusMessageResponse>;
}

/** @method get */
export async function getApiNexusPending(config?: RequestInit) {
  const response = await fetch("/api/nexus/pending", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusPendingResponse>;
}

/** @method get */
export async function getApiNexusDelivery(config?: RequestInit) {
  const response = await fetch("/api/nexus/delivery", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusDeliveryResponse>;
}

/** @method get */
export async function getApiNexusThread(config?: RequestInit) {
  const response = await fetch("/api/nexus/thread", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusThreadResponse>;
}

/** @method get */
export async function getApiNexusTrigger(config?: RequestInit) {
  const response = await fetch("/api/nexus/trigger", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusTriggerResponse>;
}

/** @method get */
export async function getApiNexusSubscription(config?: RequestInit) {
  const response = await fetch("/api/nexus/subscription", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSubscriptionResponse>;
}

/** @method get */
export async function getApiNexusChannel(config?: RequestInit) {
  const response = await fetch("/api/nexus/channel", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusChannelResponse>;
}

/** @method put */
export async function putApiNexusChannelIdConfiguration(paths: Types.PutApiNexusChannelidConfigurationPath, body: Types.PutApiNexusChannelidConfigurationBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channel/${paths.id}/configuration`, {
    headers: { "Content-Type": "application/json" },
    method: "PUT",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PutApiNexusChannelidConfigurationResponse>;
}

/** @method delete */
export async function deleteApiNexusChannelIdCredential(paths: Types.DeleteApiNexusChannelidCredentialPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channel/${paths.id}/credential`, {
    method: "DELETE",
    ...config,
  });
  return response.json() as Promise<Types.DeleteApiNexusChannelidCredentialResponse>;
}

/** @method post */
export async function postApiNexusChannelIdAuthentication(paths: Types.PostApiNexusChannelidAuthenticationPath, body: Types.PostApiNexusChannelidAuthenticationBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channel/${paths.id}/authentication`, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusChannelidAuthenticationResponse>;
}

/** @method get */
export async function getApiNexusChannelIdAuthenticationAuthenticationId(paths: Types.GetApiNexusChannelidAuthenticationauthenticationIdPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channel/${paths.id}/authentication/${paths.authenticationId}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusChannelidAuthenticationauthenticationIdResponse>;
}

/** @method get */
export async function getApiNexusSetting(config?: RequestInit) {
  const response = await fetch("/api/nexus/setting", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSettingResponse>;
}

/** @method patch */
export async function patchApiNexusSetting(body: Types.PatchApiNexusSettingBody, config?: RequestInit) {
  const response = await fetch("/api/nexus/setting", {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusSettingResponse>;
}

/** @method get */
export async function getApiNexusAgentModel(config?: RequestInit) {
  const response = await fetch("/api/nexus/agent/model", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusAgentModelResponse>;
}

/** @method patch */
export async function patchApiNexusAgentModel(body: Types.PatchApiNexusAgentModelBody, config?: RequestInit) {
  const response = await fetch("/api/nexus/agent/model", {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusAgentModelResponse>;
}

/** @method get */
export async function getApiNexusAgentModelCatalog(config?: RequestInit) {
  const response = await fetch("/api/nexus/agent/model/catalog", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusAgentModelCatalogResponse>;
}

/** @method put */
export async function putApiNexusSessionMain(config?: RequestInit) {
  const response = await fetch("/api/nexus/session/main", {
    method: "PUT",
    ...config,
  });
  return response.json() as Promise<Types.PutApiNexusSessionMainResponse>;
}

/** @method get */
export async function getApiNexusSessionRole(config?: RequestInit) {
  const response = await fetch("/api/nexus/session/role", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSessionRoleResponse>;
}

/** @method get */
export async function getApiNexusSessionIdContext(paths: Types.GetApiNexusSessionidContextPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/session/${paths.id}/context`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSessionidContextResponse>;
}

/** @method get */
export async function getApiNexusSessionIdMailbox(paths: Types.GetApiNexusSessionidMailboxPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/session/${paths.id}/mailbox`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSessionidMailboxResponse>;
}

/** @method patch */
export async function patchApiNexusSessionIdMailboxMessageId(paths: Types.PatchApiNexusSessionidMailboxmessageIdPath, body: Types.PatchApiNexusSessionidMailboxmessageIdBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/session/${paths.id}/mailbox/${paths.messageId}`, {
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusSessionidMailboxmessageIdResponse>;
}
