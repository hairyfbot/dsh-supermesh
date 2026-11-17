import type { ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useId, useRef, useState } from 'react'
import { patchApiNexusSettings } from '../../../apis'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { administratorSignature } from '../../../store/setting'

export function General(): ReactNode {
  const { t } = useTranslation()
  const saved = useStore(state => state.setting.saved.administrators)
  const draft = useStore(state => state.setting.draft.administrators)
  const ready = useStore(state => state.data.panel !== null)
  const { editSettings, receiveGeneralSettings, clearSettingNotice } = useActions()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)
  const id = useId()
  // keep:effect Cancel saving and ignore its response when this section is disposed.
  useEffect(() => () => {
    request.current?.abort()
    request.current = null
  }, [])
  const value = draft.join(',')
  const names = value.split(/[,\s]+/).filter(Boolean)
  const valid = names.length <= 100 && names.every(name => /^[a-z0-9][\w.-]{0,254}$/i.test(name))
  const dirty = administratorSignature(draft) !== administratorSignature(saved)
  async function save(): Promise<void> {
    if (!ready || !dirty || !valid || request.current)
      return
    const controller = new AbortController()
    request.current = controller
    setSaving(true)
    setFailed(false)
    clearSettingNotice()
    try {
      const settings = await patchApiNexusSettings({ administrators: names }, { signal: controller.signal })
      if (controller.signal.aborted || request.current !== controller)
        return
      if (!settings || !Array.isArray(settings.administrators))
        throw new Error('invalid_settings')
      receiveGeneralSettings(settings.administrators)
    }
    catch {
      if (!controller.signal.aborted && request.current === controller)
        setFailed(true)
    }
    finally {
      if (request.current === controller) {
        request.current = null
        setSaving(false)
      }
    }
  }
  return (
    <form
      className="overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <header className="px-4 py-3">
        <h3 id={`${id}-title`} className="m-0 text-sm font-medium">{t('settingGeneral')}</h3>
        <p className="m-0 mt-1.5 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingGeneralDescription')}</p>
      </header>
      <div className="flex flex-col gap-2 border-t border-[var(--dsw-alias-border-l3)] px-4 py-3">
        <label htmlFor={`${id}-administrators`} className="text-xs font-medium">{t('settingAdministrators')}</label>
        <Input
          id={`${id}-administrators`}
          value={value}
          onChange={(event) => {
            editSettings({ administrators: event.target.value.split(',') })
            setFailed(false)
          }}
          disabled={!ready || saving}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!valid}
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingAdministratorsHelp')}</p>
        {!valid && <p role="alert" className="m-0 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingAdministratorsInvalid')}</p>}
        {failed && <p role="alert" className="m-0 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingGeneralSaveFailed')}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-card-fill)] px-4 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving || !dirty}
          onClick={() => {
            editSettings({ administrators: [...saved] })
            setFailed(false)
          }}
        >
          {t('settingDiscard')}
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={!ready || saving || !dirty || !valid}>{t(saving ? 'channelSaving' : 'settingSave')}</Button>
      </footer>
    </form>
  )
}
