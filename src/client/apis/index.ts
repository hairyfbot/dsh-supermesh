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

/** @method post */
export async function postApiNexusTicketsIdAction(paths: Types.PostApiNexusTicketsidactionPath, body: Types.PostApiNexusTicketsidactionBody, config?: RequestInit) {
  const response = await fetch(`/api/nexus/tickets/${paths.id}/${paths.action}`, {
    headers: { "Content-Type": "application/json" },
    method: "post",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusTicketsidactionResponse>;
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
export async function postApiNexusProjectsRefresh(config?: RequestInit) {
  const response = await fetch("/api/nexus/projects/refresh", {
    method: "post",
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusProjectsRefreshResponse>;
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

/** @method post */
export async function postApiNexusSessionsIdMailboxMessageIdHandled(paths: Types.PostApiNexusSessionsidMailboxmessageIdHandledPath, config?: RequestInit) {
  const response = await fetch(`/api/nexus/sessions/${paths.id}/mailbox/${paths.messageId}/handled`, {
    method: "post",
    ...config,
  });
  return response.json() as Promise<Types.PostApiNexusSessionsidMailboxmessageIdHandledResponse>;
}
