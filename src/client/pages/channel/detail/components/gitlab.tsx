import type { ReactNode } from 'react'
import type { GetApiSupermeshChannelResponse } from '../../../../apis/index.type'
import { Button, Input, Modal, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsync, useTimeoutPoll } from '@reause/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { deleteApiSupermeshChannelIdCredential, getApiSupermeshChannel, getApiSupermeshChannelIdAuthenticationAuthenticationId, postApiSupermeshChannelIdAuthentication, putApiSupermeshChannelIdConfiguration } from '../../../../apis'
import { GitLabIcon } from '../../../../components/icons'
import { keys } from '../../../../config/query-keys'
import { useTranslation } from '../../../../hooks/use-translation'
import { Environment } from './environment'
import { DetailHeader } from './header'
import { Section } from './section'

export function GitlabDetail(): ReactNode {
  const { t } = useTranslation()
  const client = useQueryClient()
  const channels = useQuery({
    queryKey: keys.channel,
    queryFn: () => getApiSupermeshChannel(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  const channel = channels.data?.find(channel => channel.id === 'gitlab')
  const [expectedAccount, setExpectedAccount] = useState(channel?.expectedAccount ?? '')
  const id = useId()
  const savingRequest = useRef(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deleteRequest = useRef(false)
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState('')
  const [commitName, setCommitName] = useState(channel?.commitName ?? '')
  const [commitEmail, setCommitEmail] = useState(channel?.commitEmail ?? '')
  const [method, setMethod] = useState<'authorize' | 'token'>('authorize')
  const [host, setHost] = useState(channel?.host ?? 'https://gitlab.com')
  const [hostInvalid, setHostInvalid] = useState(false)
  const [authentication, setAuthentication] = useState<Awaited<ReturnType<typeof postApiSupermeshChannelIdAuthentication>> | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const [authNotice, setAuthNotice] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const authRequest = useRef(false)
  const authId = useRef<string | null>(null)
  const lifetime = useRef(new AbortController())
  // keep:effect Abort authentication requests when this channel component is disposed.
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useAsync(async (onCancel) => {
    if (channels)
      return
    const controller = new AbortController()
    onCancel(() => controller.abort())
    try {
      await reload(controller.signal)
    }
    catch {

    }
  }, undefined)
  async function reload(signal?: AbortSignal): Promise<GetApiSupermeshChannelResponse | null> {
    const value = await getApiSupermeshChannel(signal ? { signal } : undefined)
    if (signal?.aborted)
      return null
    if (!Array.isArray(value))
      throw new Error('channel_reload_failed')
    client.setQueryData(keys.channel, value)
    return value
  }
  async function reloadSaved(signal?: AbortSignal): Promise<GetApiSupermeshChannelResponse[number]> {
    const saved = (await reload(signal))?.find(channel => channel.id === 'gitlab')
    if (!saved)
      throw new Error('channel_reload_failed')
    return saved
  }
  const { pause, resume } = useTimeoutPoll(async () => {
    if (!authId.current || lifetime.current.signal.aborted)
      return
    try {
      await applyAuthentication(await getApiSupermeshChannelIdAuthenticationAuthenticationId({ id: 'gitlab', authenticationId: authId.current }, { signal: lifetime.current.signal }))
    }
    catch {
      failAuthentication()
    }
  }, 1000, { immediate: false })
  async function applyAuthentication(value: Awaited<ReturnType<typeof postApiSupermeshChannelIdAuthentication>>): Promise<void> {
    if (lifetime.current.signal.aborted)
      return
    if (!value || typeof value.id !== 'string' || !value.id || value.channelId !== 'gitlab' || typeof value.output !== 'string' || !['pending', 'succeeded', 'failed'].includes(value.status) || (authId.current && authId.current !== value.id) || (value.userCode !== undefined && typeof value.userCode !== 'string') || (value.verificationUri !== undefined && typeof value.verificationUri !== 'string'))
      throw new Error('invalid_authentication')
    authId.current = value.id
    setAuthentication(value)
    if (value.status === 'pending') {
      setAuthNotice(t('channelAuthPending'))
      return
    }
    pause()
    setAuthNotice(t(value.status === 'succeeded' ? 'channelAuthSucceeded' : 'channelAuthFailed'))
    if (value.status === 'succeeded')
      await reload(lifetime.current.signal)
    authRequest.current = false
    setAuthenticating(false)
  }
  function failAuthentication(): void {
    if (lifetime.current.signal.aborted)
      return
    pause()
    authRequest.current = false
    setAuthenticating(false)
    setAuthNotice(t('channelAuthFailed'))
  }
  const authorize = async (): Promise<void> => {
    if (authRequest.current || savingRequest.current)
      return
    if (!validateHost())
      return
    authRequest.current = true
    authId.current = null
    setAuthenticating(true)
    setAuthentication(null)
    setCopyNotice('')
    setAuthNotice(t('channelAuthStarting'))
    try {
      const value = await postApiSupermeshChannelIdAuthentication({ id: 'gitlab' }, { host: host.trim() }, { signal: lifetime.current.signal })
      await applyAuthentication(value)
      if (!lifetime.current.signal.aborted && value.status === 'pending')
        resume()
    }
    catch {
      failAuthentication()
    }
  }
  const copyCode = async (): Promise<void> => {
    if (!authentication?.userCode)
      return
    try {
      await navigator.clipboard.writeText(authentication.userCode)
      if (!lifetime.current.signal.aborted)
        setCopyNotice(t('channelAuthCopied'))
    }
    catch {
      if (!lifetime.current.signal.aborted)
        setCopyNotice(t('channelAuthCopyFailed'))
    }
  }
  const verification = authentication?.verificationUri && URL.canParse(authentication.verificationUri) ? new URL(authentication.verificationUri) : null
  const authHost = URL.canParse(host) ? new URL(host).origin : null
  const verificationUri = verification?.protocol === 'https:' && verification.origin === authHost && !verification.username && !verification.password ? verification.href : null
  const save = async (): Promise<void> => {
    if (savingRequest.current || authRequest.current)
      return
    if (!validateHost())
      return
    savingRequest.current = true
    setSaving(true)
    setNotice('')
    try {
      const result = await putApiSupermeshChannelIdConfiguration({ id: 'gitlab' }, { host: host.trim(), ...(expectedAccount.trim() !== (channel?.expectedAccount ?? '').trim() ? { expectedAccount: expectedAccount.trim() } : {}), ...(token.trim() && !channel?.hasCredential ? { enabled: true } : {}), commitName: commitName.trim(), commitEmail: commitEmail.trim(), ...(token.trim() ? { token: token.trim() } : {}) }, { signal: lifetime.current.signal })
      if (lifetime.current.signal.aborted)
        return
      if (!('channel' in result))
        throw new Error('channel_save_failed')
      const saved = await reloadSaved(lifetime.current.signal)
      if (lifetime.current.signal.aborted)
        return
      reset(saved)
      setNotice(t('channelGitlabSaved'))
    }
    catch {
      if (!lifetime.current.signal.aborted)
        setNotice(t('channelSaveFailed'))
    }
    finally {
      savingRequest.current = false
      if (!lifetime.current.signal.aborted)
        setSaving(false)
    }
  }
  function reset(saved = channel): void {
    setHost(saved?.host ?? 'https://gitlab.com')
    setExpectedAccount(saved?.expectedAccount ?? '')
    setCommitName(saved?.commitName ?? '')
    setCommitEmail(saved?.commitEmail ?? '')
    setToken('')
    setHostInvalid(false)
    setNotice('')
    setAuthNotice('')
    setCopyNotice('')
    setAuthentication(null)
  }
  const toggle = async (): Promise<void> => {
    if (!channel?.hasCredential || savingRequest.current || authRequest.current)
      return
    savingRequest.current = true
    setSaving(true)
    setNotice('')
    try {
      const result = await putApiSupermeshChannelIdConfiguration({ id: 'gitlab' }, { enabled: !channel.enabled }, { signal: lifetime.current.signal })
      if (lifetime.current.signal.aborted)
        return
      if (!('channel' in result))
        throw new Error('channel_save_failed')
      await reload(lifetime.current.signal)
    }
    catch {
      if (!lifetime.current.signal.aborted)
        setNotice(t('channelSaveFailed'))
    }
    finally {
      savingRequest.current = false
      if (!lifetime.current.signal.aborted)
        setSaving(false)
    }
  }
  function openDelete(): void {
    if (!channel?.hasCredential || savingRequest.current || authRequest.current)
      return
    savingRequest.current = true
    setDeleteConfirming(true)
  }
  function closeDelete(): void {
    if (deleteRequest.current)
      return
    savingRequest.current = false
    setDeleteConfirming(false)
  }
  const deleteCredential = async (): Promise<void> => {
    if (!deleteConfirming || deleteRequest.current || authRequest.current)
      return
    deleteRequest.current = true
    setDeleting(true)
    setNotice('')
    try {
      const result = await deleteApiSupermeshChannelIdCredential({ id: 'gitlab' }, { signal: lifetime.current.signal })
      if (lifetime.current.signal.aborted)
        return
      if (!('channel' in result))
        throw new Error('channel_delete_failed')
      const saved = await reloadSaved(lifetime.current.signal)
      if (lifetime.current.signal.aborted)
        return
      reset(saved)
    }
    catch {
      if (!lifetime.current.signal.aborted)
        setNotice(t('channelDeleteFailed'))
    }
    finally {
      deleteRequest.current = false
      savingRequest.current = false
      if (!lifetime.current.signal.aborted) {
        setDeleting(false)
        setDeleteConfirming(false)
      }
    }
  }
  function normalizeHost(value: string): string {
    return URL.canParse(value.trim()) ? new URL(value.trim()).href : value.trim()
  }
  const dirty = normalizeHost(host) !== normalizeHost(channel?.host ?? 'https://gitlab.com')
    || expectedAccount.trim() !== (channel?.expectedAccount ?? '').trim()
    || commitName.trim() !== (channel?.commitName ?? '').trim()
    || commitEmail.trim() !== (channel?.commitEmail ?? '').trim()
    || Boolean(token.trim())
  function validateHost(): boolean {
    const url = URL.canParse(host.trim()) ? new URL(host.trim()) : null
    const valid = Boolean(url && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/')
    setHostInvalid(!valid)
    return valid
  }
  const busy = saving || authenticating || deleteConfirming
  const tabs = [
    { value: 'authorize' as const, label: <span className="inline-flex items-center gap-1.5">{t('channelAuthorize')}</span>, id: `${id}-authorize`, panelId: `${id}-authorize-panel` },
    { value: 'token' as const, label: t('channelToken'), id: `${id}-token`, panelId: `${id}-token-panel` },
  ] as const
  return (
    <>
      <DetailHeader
        name={channel?.name ?? 'GitLab'}
        icon={<GitLabIcon width={27} height={27} />}
        actions={channel?.hasCredential && (
          <>
            <Tag>{t('channelConfigured')}</Tag>
            <Button size="sm" variant="outline" className="[--dsh-button-outline-color:var(--dsw-alias-state-error-primary)] text-(--dsw-alias-state-error-primary)!" disabled={busy} onClick={openDelete}>{t('channelDelete')}</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void toggle()}>{t(channel.enabled ? 'channelDisable' : 'channelEnable')}</Button>
          </>
        )}
      />
      <Modal
        open={deleteConfirming}
        onClose={closeDelete}
        title={t('channelDeleteTitle')}
        closeLabel={t('channelCancel')}
        description={t('channelDeleteDescription')}
        footer={(
          <>
            <Button variant="outline" disabled={deleting} onClick={closeDelete} data-modal-autofocus>{t('channelCancel')}</Button>
            <Button variant="outline" className="[--dsh-button-outline-color:var(--dsw-alias-state-error-primary)] text-(--dsw-alias-state-error-primary)!" disabled={deleting} onClick={() => void deleteCredential()}>{t(deleting ? 'channelDeleting' : 'channelDeleteConfirm')}</Button>
          </>
        )}
      />
      <p className="m-0 rounded-xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-card-fill) px-4 py-3 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelGitlabAvailability')}</p>
      <p className="m-0 text-xs text-(--dsw-alias-label-secondary)">{t('channelSingleAccount')}</p>
      <div className="grid min-w-0 items-start gap-4 @min-[780px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title={t('channelSite')} description={t('channelSiteDescription')}>
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-host`} className="text-xs font-medium">{t('channelHost')}</label>
              <Input
                id={`${id}-host`}
                type="url"
                value={host}
                disabled={busy}
                onChange={(event) => {
                  setHost(event.target.value)
                  setHostInvalid(false)
                }}
                onBlur={validateHost}
                spellCheck={false}
                autoComplete="url"
                aria-invalid={hostInvalid}
                aria-describedby={`${id}-host-help${hostInvalid ? ` ${id}-host-error` : ''}`}
              />
              <p id={`${id}-host-help`} className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelHostHelp')}</p>
              {hostInvalid && <p id={`${id}-host-error`} role="alert" className="m-0 text-xs text-(--dsw-alias-state-error-primary)">{t('channelHostInvalid')}</p>}
            </div>
          </Section>
          <Section title={t('channelAccount')} description={t('channelAccountDescription')}>
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-username`} className="text-xs font-medium">{t('channelLoginName')}</label>
              <Input id={`${id}-username`} value={expectedAccount} onChange={event => setExpectedAccount(event.target.value)} disabled={busy} maxLength={100} placeholder="supermesh-bot" autoComplete="off" spellCheck={false} aria-describedby={`${id}-username-help`} />
              <p id={`${id}-username-help`} className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelLoginNameHelp')}</p>
            </div>
            <div className="grid gap-3 @min-[540px]:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor={`${id}-commit-name`} className="text-xs font-medium">{t('channelCommitName')}</label>
                <Input id={`${id}-commit-name`} placeholder="Supermesh Bot" value={commitName} onChange={event => setCommitName(event.target.value)} disabled={busy} maxLength={200} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={`${id}-commit-email`} className="text-xs font-medium">{t('channelCommitEmail')}</label>
                <Input id={`${id}-commit-email`} type="email" placeholder="bot@example.com" value={commitEmail} onChange={event => setCommitEmail(event.target.value)} disabled={busy} maxLength={254} autoComplete="off" spellCheck={false} />
              </div>
            </div>
            <p className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelCommitHelp')}</p>
            <div className="flex flex-col gap-3 border-t border-(--dsw-alias-border-l3) pt-4">
              <div className="max-w-full overflow-x-auto"><SegmentedTabs value={method} onChange={setMethod} items={tabs} label={t('channelLoginMethod')} size="sm" className="w-fit" /></div>
              <div key={method} id={`${id}-${method}-panel`} role="tabpanel" aria-labelledby={`${id}-${method}`} tabIndex={0} className="flex min-w-0 flex-col items-start gap-3 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dsw-alias-state-business-primary)">
                {method === 'authorize'
                  ? (
                      <>
                        <p className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelGitlabAuthorizeDescription')}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => void authorize()}>{t('channelAuthorizeAction', { name: 'GitLab' })}</Button>
                          {authNotice && <p role="status" className="m-0 text-xs leading-5">{authNotice}</p>}
                        </div>
                        {authentication?.userCode && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span>{t('channelAuthCode')}</span>
                            <code>{authentication.userCode}</code>
                            <Button size="sm" variant="outline" onClick={() => void copyCode()}>{t('channelAuthCopyCode')}</Button>
                            {copyNotice && <span role="status">{copyNotice}</span>}
                          </div>
                        )}
                        {verificationUri && <a href={verificationUri} target="_blank" rel="noopener noreferrer" className="text-xs text-(--dsw-alias-state-business-primary) underline">{t('channelAuthOpenVerification')}</a>}
                        {authentication?.output && <pre aria-label={t('channelAuthOutput')} className="m-0 w-full whitespace-pre-wrap break-words rounded-lg bg-(--dsw-alias-card-fill) px-3 py-2 font-mono text-xs leading-5">{authentication.output}</pre>}
                      </>
                    )
                  : (
                      <>
                        <label htmlFor={`${id}-token-value`} className="text-xs font-medium">{t('channelTokenLabel')}</label>
                        <Input id={`${id}-token-value`} className="w-full min-w-0" type="password" value={token} onChange={event => setToken(event.target.value)} disabled={busy} autoComplete="new-password" placeholder={t('channelTokenPlaceholder')} aria-describedby={`${id}-token-help`} />
                        <p id={`${id}-token-help`} className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelGitlabTokenDescription')}</p>
                      </>
                    )}
              </div>
            </div>
            {dirty && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => reset()}>{t('channelCancel')}</Button>
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>{t(saving ? 'channelSaving' : 'channelSaveConfiguration')}</Button>
              </div>
            )}
            {notice && <p role="status" className="m-0 text-xs leading-5">{notice}</p>}
          </Section>
        </div>
        <Environment description={t('channelGitlabWorkerIdentity')} />
      </div>
    </>
  )
}
