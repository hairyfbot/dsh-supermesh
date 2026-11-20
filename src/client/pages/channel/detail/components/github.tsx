import type { ReactNode } from 'react'
import { Button, Input, Modal, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsync, useTimeoutPoll } from '@reause/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { deleteApiSupermeshChannelIdCredential, getApiSupermeshChannel, getApiSupermeshChannelIdAuthenticationAuthenticationId, postApiSupermeshChannelIdAuthentication, putApiSupermeshChannelIdConfiguration } from '@/client/apis'
import { GitHubIcon } from '@/client/components/icons'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'
import { Environment } from '@/client/pages/channel/detail/components/environment'
import { DetailHeader } from '@/client/pages/channel/detail/components/header'
import { Section } from '@/client/pages/channel/detail/components/section'

export function GithubDetail(): ReactNode {
  const { t } = useTranslation()
  const client = useQueryClient()
  const channels = useQuery({
    queryKey: keys.channel,
    queryFn: () => getApiSupermeshChannel(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  const channel = channels.data?.find(channel => channel.id === 'github')
  const id = useId()
  const savingRequest = useRef(false)
  const deletingRequest = useRef(false)
  const [saving, setSaving] = useState(false)
  const [deletion, setDeletion] = useState<'confirming' | 'deleting' | null>(null)
  const [deleteNotice, setDeleteNotice] = useState('')
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState('')
  const [commitName, setCommitName] = useState<string | null>(null)
  const [commitEmail, setCommitEmail] = useState<string | null>(null)
  const [confirmingEmail, setConfirmingEmail] = useState(false)
  const suggestion = channel?.commitEmailSuggestion ?? ''
  const nameValue = commitName ?? channel?.commitName ?? ''
  const emailValue = commitEmail ?? channel?.commitEmail ?? suggestion
  const emailMismatch = Boolean(suggestion) && Boolean(emailValue.trim()) && emailValue.trim().toLowerCase() !== suggestion.toLowerCase()
  const hasCredential = Boolean(channel?.hasCredential)
  const identityDirty = nameValue.trim() !== (channel?.commitName ?? '').trim() || emailValue.trim() !== (channel?.commitEmail ?? '').trim()
  const dirty = token.length > 0 || identityDirty
  const canSave = (hasCredential || Boolean(token.trim())) && (identityDirty || Boolean(token.trim()))
  const [method, setMethod] = useState<'authorize' | 'token'>('authorize')
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
      await reload()
    }
    catch {

    }
  }, undefined)
  async function reload(): Promise<void> {
    await client.invalidateQueries({ queryKey: keys.channel })
  }
  const { pause, resume } = useTimeoutPoll(async () => {
    if (!authId.current || lifetime.current.signal.aborted)
      return
    try {
      await applyAuthentication(await getApiSupermeshChannelIdAuthenticationAuthenticationId({ id: 'github', authenticationId: authId.current }, { signal: lifetime.current.signal }))
    }
    catch {
      failAuthentication()
    }
  }, 1000, { immediate: false })
  async function applyAuthentication(value: Awaited<ReturnType<typeof postApiSupermeshChannelIdAuthentication>>): Promise<void> {
    if (lifetime.current.signal.aborted)
      return
    if (!value || typeof value.id !== 'string' || !value.id || value.channelId !== 'github' || typeof value.output !== 'string' || !['pending', 'succeeded', 'failed'].includes(value.status) || (authId.current && authId.current !== value.id) || (value.userCode !== undefined && typeof value.userCode !== 'string') || (value.verificationUri !== undefined && typeof value.verificationUri !== 'string'))
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
      await reload()
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
    authRequest.current = true
    authId.current = null
    setAuthenticating(true)
    setAuthentication(null)
    setCopyNotice('')
    setAuthNotice(t('channelAuthStarting'))
    try {
      const value = await postApiSupermeshChannelIdAuthentication({ id: 'github' }, {}, { signal: lifetime.current.signal })
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
  const authHost = 'https://github.com'
  const verificationUri = verification?.protocol === 'https:' && verification.origin === authHost && !verification.username && !verification.password ? verification.href : null
  const cancel = (): void => {
    setCommitName(null)
    setCommitEmail(null)
    setToken('')
    setNotice('')
    setDeleteNotice('')
    setAuthNotice('')
    setCopyNotice('')
    setAuthentication(null)
    setConfirmingEmail(false)
    authId.current = null
  }
  const commit = async (toggle: boolean): Promise<void> => {
    if (!channel || savingRequest.current || authRequest.current)
      return
    savingRequest.current = true
    setSaving(true)
    setNotice('')
    try {
      const result = await putApiSupermeshChannelIdConfiguration({ id: 'github' }, toggle
        ? { enabled: !channel.enabled }
        : { commitName: nameValue.trim(), commitEmail: emailValue.trim(), ...(token.trim() ? { token: token.trim(), enabled: hasCredential ? channel.enabled : true } : {}) })
      if (!('channel' in result))
        throw new Error('channel_save_failed')
      await reload()
      if (!toggle)
        cancel()
      setNotice(t('channelSaved'))
    }
    catch {
      setNotice(t('channelSaveFailed'))
    }
    finally {
      savingRequest.current = false
      setSaving(false)
    }
  }
  const save = async (toggle = false): Promise<void> => {
    if (!channel || savingRequest.current || authRequest.current || (toggle ? !hasCredential : !canSave))
      return
    if (!toggle && emailMismatch) {
      setConfirmingEmail(true)
      return
    }
    await commit(toggle)
  }
  const openDelete = (): void => {
    if (!hasCredential || savingRequest.current || authRequest.current)
      return
    savingRequest.current = true
    setDeletion('confirming')
  }
  const closeDelete = (): void => {
    if (deletingRequest.current)
      return
    savingRequest.current = false
    setDeletion(null)
  }
  const deleteCredentials = async (): Promise<void> => {
    if (deletion !== 'confirming' || deletingRequest.current || !hasCredential)
      return
    deletingRequest.current = true
    setDeletion('deleting')
    try {
      const result = await deleteApiSupermeshChannelIdCredential({ id: 'github' }, { signal: lifetime.current.signal })
      if (lifetime.current.signal.aborted)
        return
      if (!('channel' in result))
        throw new Error('channel_delete_failed')
      await reload()
      if (lifetime.current.signal.aborted)
        return
      cancel()
    }
    catch {
      if (!lifetime.current.signal.aborted)
        setDeleteNotice(t('channelDeleteFailed'))
    }
    finally {
      deletingRequest.current = false
      savingRequest.current = false
      if (!lifetime.current.signal.aborted)
        setDeletion(null)
    }
  }
  const busy = saving || authenticating || deletion !== null
  const tabs = [
    { value: 'authorize' as const, label: <span className="inline-flex items-center gap-1.5">{t('channelAuthorize')}</span>, id: `${id}-authorize`, panelId: `${id}-authorize-panel` },
    { value: 'token' as const, label: t('channelToken'), id: `${id}-token`, panelId: `${id}-token-panel` },
  ] as const
  return (
    <>
      <DetailHeader
        name={channel?.name ?? 'GitHub'}
        icon={<GitHubIcon width={27} height={27} />}
        actions={hasCredential && (
          <>
            <Tag>{t('channelConfigured')}</Tag>
            <Button size="sm" variant="outline" className="border-(--dsw-alias-state-error-primary) text-(--dsw-alias-state-error-primary)" disabled={busy} onClick={openDelete}>{t('channelDelete')}</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void save(true)}>{t(channel?.enabled ? 'channelDisable' : 'channelEnable')}</Button>
          </>
        )}
      />
      <p className="m-0 rounded-xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-card-fill) px-4 py-3 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelGithubAvailability')}</p>
      <p className="m-0 text-xs text-(--dsw-alias-label-secondary)">{t('channelSingleAccount')}</p>
      <div className="grid min-w-0 items-start gap-4 @min-[780px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title={t('channelAccount')} description={t('channelAccountDescription')}>
            <div className="grid gap-3 @min-[540px]:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor={`${id}-commit-name`} className="text-xs font-medium">{t('channelCommitName')}</label>
                <Input id={`${id}-commit-name`} placeholder="Supermesh Bot" value={nameValue} onChange={event => setCommitName(event.target.value)} disabled={busy} maxLength={200} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={`${id}-commit-email`} className="text-xs font-medium">{t('channelCommitEmail')}</label>
                <Input id={`${id}-commit-email`} type="email" placeholder={suggestion || 'bot@example.com'} value={emailValue} onChange={event => setCommitEmail(event.target.value)} disabled={busy} maxLength={254} autoComplete="off" spellCheck={false} aria-describedby={`${id}-commit-help`} />
              </div>
            </div>
            <p id={`${id}-commit-help`} className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelCommitHelp')}</p>
            <div className="flex flex-col gap-3 border-t border-(--dsw-alias-border-l3) pt-4">
              <div className="max-w-full overflow-x-auto"><SegmentedTabs value={method} onChange={setMethod} items={tabs} label={t('channelLoginMethod')} size="sm" className="w-fit" /></div>
              <div key={method} id={`${id}-${method}-panel`} role="tabpanel" aria-labelledby={`${id}-${method}`} tabIndex={0} className="flex min-w-0 flex-col items-start gap-3 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dsw-alias-state-business-primary)">
                {method === 'authorize'
                  ? (
                      <>
                        <p className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelGithubAuthorizeDescription')}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => void authorize()}>{t('channelAuthorizeAction', { name: 'GitHub' })}</Button>
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
                        <p id={`${id}-token-help`} className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelTokenDescription')}</p>
                      </>
                    )}
              </div>
            </div>
            {notice && <p role="status" className="m-0 text-xs leading-5">{notice}</p>}
            {deleteNotice && <p role="status" className="m-0 text-xs leading-5 text-(--dsw-alias-state-error-primary)">{deleteNotice}</p>}
            {dirty && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>{t('channelCancel')}</Button>
                <Button size="sm" variant="primary" disabled={busy || !canSave} onClick={() => void save()}>{t(saving ? 'channelSaving' : 'channelSaveConfiguration')}</Button>
              </div>
            )}
          </Section>
        </div>
        <Environment description={t('channelGithubWorkerIdentity')} />
      </div>
      <Modal
        open={confirmingEmail}
        onClose={() => setConfirmingEmail(false)}
        title={t('channelCommitEmailMismatchTitle')}
        closeLabel={t('channelCancel')}
        description={t('channelCommitEmailMismatchDescription', { email: emailValue.trim(), suggestion })}
        footer={(
          <>
            <Button variant="outline" disabled={saving} onClick={() => setConfirmingEmail(false)}>{t('channelCancel')}</Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => {
                setConfirmingEmail(false)
                void commit(false)
              }}
            >
              {t('channelCommitEmailMismatchConfirm')}
            </Button>
          </>
        )}
      />
      <Modal
        open={deletion !== null}
        onClose={closeDelete}
        title={t('channelDeleteTitle')}
        closeLabel={t('channelCancel')}
        description={t('channelDeleteDescription')}
        footer={(
          <>
            <Button variant="outline" disabled={deletion === 'deleting'} onClick={closeDelete}>{t('channelCancel')}</Button>
            <Button variant="primary" className="border-(--dsw-alias-state-error-primary) text-(--dsw-alias-state-error-primary)" disabled={deletion === 'deleting'} onClick={() => void deleteCredentials()}>{t(deletion === 'deleting' ? 'channelDeleting' : 'channelDeleteConfirm')}</Button>
          </>
        )}
      />
    </>
  )
}
