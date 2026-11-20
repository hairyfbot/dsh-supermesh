import type { ReactNode } from 'react'
import type { PatchApiSupermeshSettingBody } from '@/client/apis/index.type'
import type { RuntimeSettings } from '@/client/store/setting'
import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { useId } from 'react'
import { useTranslation } from '@/client/hooks/use-translation'
import { administratorSignature, INFERRED_MODES } from '@/client/store/setting'

const INFERRED_LABELS = { off: 'settingInferredOff', observe: 'settingInferredObserve', auto: 'settingInferredAuto' } as const

export function General({ value, baseline, pending, failed, onChange, onDiscard, onSave }: {
  value: RuntimeSettings
  baseline: RuntimeSettings
  pending: boolean
  failed: boolean
  onChange: (patch: Partial<RuntimeSettings>) => void
  onDiscard: () => void
  onSave: (patch: PatchApiSupermeshSettingBody) => Promise<void>
}): ReactNode {
  const { t } = useTranslation()
  const id = useId()
  const administrators = value.administrators.join(',')
  const names = administrators.split(/[,\s]+/).filter(Boolean)
  const valid = names.length <= 100 && names.every(name => /^[a-z0-9][\w.-]{0,254}$/i.test(name))
  const dirty = administratorSignature(value.administrators) !== administratorSignature(baseline.administrators) || value.inferred !== baseline.inferred || value.autoArchiveWorkers !== baseline.autoArchiveWorkers
  return (
    <form
      className="overflow-hidden rounded-2xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1)"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault()
        if (dirty && valid && !pending)
          void onSave({ administrators: names, inferred: value.inferred, autoArchiveWorkers: value.autoArchiveWorkers })
      }}
    >
      <header className="px-4 py-3">
        <h3 id={`${id}-title`} className="m-0 text-sm font-medium">{t('settingGeneral')}</h3>
        <p className="m-0 mt-1.5 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('settingGeneralDescription')}</p>
      </header>
      <div className="flex flex-col gap-2 border-t border-(--dsw-alias-border-l3) px-4 py-3">
        <label htmlFor={`${id}-administrators`} className="text-xs font-medium">{t('settingAdministrators')}</label>
        <Input
          id={`${id}-administrators`}
          value={administrators}
          onChange={event => onChange({ administrators: event.target.value.split(',') })}
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!valid}
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('settingAdministratorsHelp')}</p>
        {!valid && <p role="alert" className="m-0 text-xs text-(--dsw-alias-state-error-primary)">{t('settingAdministratorsInvalid')}</p>}
        {failed && <p role="alert" className="m-0 text-xs text-(--dsw-alias-state-error-primary)">{t('settingGeneralSaveFailed')}</p>}
      </div>
      <div className="flex items-start justify-between gap-5 border-t border-(--dsw-alias-border-l3) px-4 py-3">
        <div className="min-w-0">
          <h4 className="m-0 text-xs font-medium">{t('settingInferred')}</h4>
          <p className="m-0 mt-1.5 max-w-lg text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('settingInferredHelp')}</p>
        </div>
        <div role="group" aria-label={t('settingInferred')} className="flex shrink-0 gap-1 rounded-lg bg-(--dsw-alias-card-fill) p-1">
          {INFERRED_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              aria-pressed={value.inferred === mode}
              disabled={pending}
              onClick={() => onChange({ inferred: mode })}
              className={`cursor-pointer rounded-md border-0 px-2.5 py-1.5 font-[inherit] text-xs outline-none transition-colors focus-visible:outline-2 focus-visible:outline-(--dsw-alias-state-business-primary) ${value.inferred === mode ? 'bg-(--dsw-alias-bg-layer-1) font-medium text-(--dsw-alias-label-primary)' : 'bg-transparent text-(--dsw-alias-label-secondary) hover:bg-(--dsw-alias-bg-layer-1)'}`}
            >
              {t(INFERRED_LABELS[mode])}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-start justify-between gap-5 border-t border-(--dsw-alias-border-l3) px-4 py-3">
        <div className="min-w-0">
          <h4 className="m-0 text-xs font-medium">{t('settingAutoArchiveWorkers')}</h4>
          <p className="m-0 mt-1.5 max-w-lg text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('settingAutoArchiveWorkersHelp')}</p>
        </div>
        <Switch disabled={pending} checked={value.autoArchiveWorkers} label={t('settingAutoArchiveWorkers')} onChange={autoArchiveWorkers => onChange({ autoArchiveWorkers })} />
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-(--dsw-alias-border-l3) bg-(--dsw-alias-card-fill) px-4 py-2.5">
        <Button type="button" size="sm" variant="ghost" disabled={pending || !dirty} onClick={onDiscard}>{t('settingDiscard')}</Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending || !dirty || !valid}>{t(pending ? 'channelSaving' : 'settingSave')}</Button>
      </footer>
    </form>
  )
}
