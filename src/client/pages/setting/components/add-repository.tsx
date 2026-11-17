import type { ReactNode } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useId, useRef, useState } from 'react'
import { parseRepositoryRemote } from '../../../../utils/repository'
import { getApiNexusPanel, postApiNexusRepositories } from '../../../apis'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function AddRepository(): ReactNode {
  const { t } = useTranslation()
  const { receivePanel } = useActions()
  const gitlabHost = useStore(state => state.data.panel?.channels.find(channel => channel.id === 'gitlab')?.host ?? 'https://gitlab.com')
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const lifetime = useRef(new AbortController())
  const id = useId()
  // keep:effect Cancel repository creation requests when the settings section is disposed.
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  let repository: ReturnType<typeof parseRepositoryRemote> | null = null
  try {
    if (remote.trim())
      repository = parseRepositoryRemote(remote.trim(), gitlabHost)
  }
  catch {}
  const workspaceName = name ?? repository?.defaultName ?? ''
  function close(): void {
    if (!pending.current)
      setOpen(false)
  }
  async function save(): Promise<void> {
    if (!repository || !workspaceName.trim() || pending.current)
      return
    pending.current = true
    setSaving(true)
    setError('')
    try {
      const result = await postApiNexusRepositories({ remoteUrl: remote.trim(), name: workspaceName.trim() }, { signal: lifetime.current.signal })
      if (lifetime.current.signal.aborted)
        return
      if (!result || !('project' in result))
        throw new Error(t('settingRepositoryAddFailed'))
      setOpen(false)
      setRemote('')
      setName(null)
      setNotice(t('settingRepositoryCreated'))
      try {
        const panel = await getApiNexusPanel({ signal: lifetime.current.signal })
        if (lifetime.current.signal.aborted)
          return
        if (!panel || !('projects' in panel))
          throw new Error('invalid_panel')
        receivePanel(panel)
      }
      catch {
        if (!lifetime.current.signal.aborted)
          setNotice(t('settingRepositoryRefreshFailed'))
      }
    }
    catch (reason) {
      if (!lifetime.current.signal.aborted)
        setError(reason instanceof Error ? reason.message : t('settingRepositoryAddFailed'))
    }
    finally {
      pending.current = false
      if (!lifetime.current.signal.aborted)
        setSaving(false)
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          setNotice('')
          setError('')
          setOpen(true)
        }}
      >
        {t('settingAddRepository')}
      </Button>
      {notice && <span role="status" className="text-xs text-[var(--dsw-alias-label-secondary)]">{notice}</span>}
      <Modal
        open={open}
        onClose={close}
        title={t('settingAddRepository')}
        closeLabel={t('channelCancel')}
        description={t('settingAddRepositoryHelp')}
        footer={(
          <>
            <Button variant="outline" disabled={saving} onClick={close}>{t('channelCancel')}</Button>
            <Button variant="primary" disabled={saving || !repository || !workspaceName.trim()} onClick={() => void save()}>{t(saving ? 'settingAddingRepository' : 'settingAddRepository')}</Button>
          </>
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-remote`} className="text-xs font-medium">{t('settingRemoteUrl')}</label>
            <Input
              id={`${id}-remote`}
              value={remote}
              onChange={(event) => {
                setRemote(event.currentTarget.value)
                setError('')
              }}
              disabled={saving}
              placeholder="https://github.com/owner/repository.git"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(remote.trim()) && !repository}
              aria-describedby={`${id}-remote-help`}
            />
            <p id={`${id}-remote-help`} className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingRepositoryRemoteHelp')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-name`} className="text-xs font-medium">{t('settingWorkspaceName')}</label>
            <Input
              id={`${id}-name`}
              value={workspaceName}
              onChange={(event) => {
                setName(event.currentTarget.value)
                setError('')
              }}
              disabled={saving}
              maxLength={120}
              aria-describedby={`${id}-name-help`}
            />
            <p id={`${id}-name-help`} className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingRepositoryNameHelp')}</p>
          </div>
          {error && <p role="alert" className="m-0 break-words text-xs text-[var(--dsw-alias-state-error-primary)]">{error}</p>}
        </div>
      </Modal>
    </>
  )
}
