/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type * as Types from "./index.type";

/** @method get */
export async function getApiNexusPanel(config?: RequestInit) {
  const response = await fetch("/api/nexus/panel", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusPanelResponse>;
}

/** @method get */
export async function getApiNexusTicketsId(paths: Types.GetApiNexusTicketsidPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/tickets/${paths.id}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusTicketsidResponse>;
}

/** @method patch */
export async function patchApiNexusTicketsId(paths: Types.PatchApiNexusTicketsidPath, body: Types.PatchApiNexusTicketsidBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/tickets/${paths.id}`, {
    headers: { "Content-Type": "application/json" },
    method: "patch",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusTicketsidResponse>;
}

/** @method put */
export async function putApiNexusChannelsIdConfiguration(paths: Types.PutApiNexusChannelsidConfigurationPath, body: Types.PutApiNexusChannelsidConfigurationBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channels/${paths.id}/configuration`, {
    headers: { "Content-Type": "application/json" },
    method: "put",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PutApiNexusChannelsidConfigurationResponse>;
}

/** @method delete */
export async function deleteApiNexusChannelsIdCredentials(paths: Types.DeleteApiNexusChannelsidCredentialsPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channels/${paths.id}/credentials`, {
    method: "delete",
    ...config,
  });
  return response.json() as Promise<Types.DeleteApiNexusChannelsidCredentialsResponse>;
}

/** @method post */
export async function postApiNexusChannelsIdAuthentications(paths: Types.PostApiNexusChannelsidAuthenticationsPath, body: Types.PostApiNexusChannelsidAuthenticationsBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channels/${paths.id}/authentications`, {
    headers: { "Content-Type": "application/json" },
    method: "post",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusChannelsidAuthenticationsResponse>;
}

/** @method get */
export async function getApiNexusChannelsIdAuthenticationsAuthenticationId(paths: Types.GetApiNexusChannelsidAuthenticationsauthenticationIdPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/channels/${paths.id}/authentications/${paths.authenticationId}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusChannelsidAuthenticationsauthenticationIdResponse>;
}

/** @method patch */
export async function patchApiNexusProjectsId(paths: Types.PatchApiNexusProjectsidPath, body: Types.PatchApiNexusProjectsidBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/projects/${paths.id}`, {
    headers: { "Content-Type": "application/json" },
    method: "patch",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusProjectsidResponse>;
}

/** @method post */
export async function postApiNexusProjects(config?: RequestInit) {
  const response = await fetch("/api/nexus/projects", {
    method: "post",
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusProjectsResponse>;
}

/** @method put */
export async function putApiNexusProjectsIdSession(paths: Types.PutApiNexusProjectsidSessionPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/projects/${paths.id}/session`, {
    method: "put",
    ...config,
  });
  return response.json() as Promise<Types.PutApiNexusProjectsidSessionResponse>;
}

/** @method post */
export async function postApiNexusProjectsIdOpenings(paths: Types.PostApiNexusProjectsidOpeningsPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/projects/${paths.id}/openings`, {
    method: "post",
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusProjectsidOpeningsResponse>;
}

/** @method put */
export async function putApiNexusSessionsMain(config?: RequestInit) {
  const response = await fetch("/api/nexus/sessions/main", {
    method: "put",
    ...config,
  });
  return response.json() as Promise<Types.PutApiNexusSessionsMainResponse>;
}

/** @method patch */
export async function patchApiNexusSettings(body: Types.PatchApiNexusSettingsBody, config?: RequestInit) {
  const response = await fetch("/api/nexus/settings", {
    headers: { "Content-Type": "application/json" },
    method: "patch",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusSettingsResponse>;
}

/** @method post */
export async function postApiNexusAsksIdAnswers(paths: Types.PostApiNexusAsksidAnswersPath, body: Types.PostApiNexusAsksidAnswersBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/asks/${paths.id}/answers`, {
    headers: { "Content-Type": "application/json" },
    method: "post",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusAsksidAnswersResponse>;
}

/** @method get */
export async function getApiNexusSessionsIdContext(paths: Types.GetApiNexusSessionsidContextPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/sessions/${paths.id}/context`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSessionsidContextResponse>;
}

/** @method get */
export async function getApiNexusSessionsIdMailbox(paths: Types.GetApiNexusSessionsidMailboxPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/sessions/${paths.id}/mailbox`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiNexusSessionsidMailboxResponse>;
}

/** @method patch */
export async function patchApiNexusSessionsIdMailboxMessageId(paths: Types.PatchApiNexusSessionsidMailboxmessageIdPath, body: Types.PatchApiNexusSessionsidMailboxmessageIdBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/sessions/${paths.id}/mailbox/${paths.messageId}`, {
    headers: { "Content-Type": "application/json" },
    method: "patch",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PatchApiNexusSessionsidMailboxmessageIdResponse>;
}
