import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood, PetState } from '../types'
import { activityOf, failureOf } from './activity'

const IDLE: PetState = { mood: 'idle', label: 'esperando' }
const state = atom({ plugin: 'pet', key: 'state' } as const, IDLE)

const CELEBRATE_MS = 4_000
const SLEEP_AFTER_MS = 5 * 60_000

const FACES: Record<Mood, string> = {
  idle: '(•‿•)',
  thinking: '(•_•)…',
  working: '(ง•̀_•́)ง',
  browsing: '(•_•)⌕',
  asking: '(°o°)!',
  happy: '(^‿^)',
  sad: '(•︵•)',
  sleeping: '(-‿-) zZ',
}

let timer: Timer | undefined
// claude -p and the SDK run sessions nobody watches: they stay out of the floating window.
let isWatched = true

async function set($: EngineInterface, next: PetState) {
  timer?.cancel()
  timer = undefined
  await update($, state, () => next)
  await share($, next.mood, next.label)
}

async function share($: EngineInterface, mood: Mood | 'gone', label: string, endingSessionId?: string) {
  if (!isWatched) {
    return
  }
  try {
    const sessionId = endingSessionId ?? (await $.session.id())
    const temp = await $.env.get('TEMP')
    if (temp === undefined) {
      return
    }
    const root = await $.session.root()
    const repo = root.split(/[\\/]/).filter(Boolean).at(-1) ?? root
    const updatedAt = await $.clock.now()
    await $.fs.write(`${temp}\\claude-pet\\${sessionId}.json`, JSON.stringify({ sessionId, repo, mood, label, updatedAt }))
  } catch {
    // The floating window is optional: a failed write must never break the band.
  }
}

async function rest($: EngineInterface) {
  await set($, IDLE)
  timer = $.clock.after(SLEEP_AFTER_MS, () => void set($, { mood: 'sleeping', label: 'durmiendo' }))
}

async function watch($: EngineInterface) {
  isWatched = true
  await rest($)
  const shipped = `${$.plugin.root.replaceAll('/', '\\')}\\window\\PetOverlay.exe`
  const overlay = (await $.env.get('CLAUDE_PET_OVERLAY')) ?? shipped
  if (await $.fs.exists(overlay).catch(() => false)) {
    await $.process.run(['cmd.exe', '/c', 'start', '', overlay]).catch(() => undefined)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isWatched = false
    if (e.isInteractive) {
      await watch($)
    }

    return next(e)
  })

  // The desktop Code tab starts its sessions through the SDK, not interactive: it is watched once the app attaches.
  on('session.attach', async ($, e, next) => {
    if (!isWatched) {
      await watch($)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await share($, 'gone', '', e.sessionId)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await set($, { mood: 'thinking', label: 'pensando' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const activity = activityOf(String(e.tool), e)
    await set($, activity)
    const ran = await next(e)
    if (ran.isError === true) {
      await set($, failureOf(String(e.tool)))
    } else if (activity.mood === 'browsing') {
      // Browser tools come in quick bursts: staying in browsing keeps the pet from flickering between them.
      await set($, { mood: 'browsing', label: 'navegando' })
    } else {
      await set($, { mood: 'thinking', label: 'pensando' })
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // Subagent turns end while the main turn is still running.
    if (e.agentId === undefined) {
      await set($, e.reason === 'answer'
        ? { mood: 'happy', label: 'listo' }
        : { mood: 'sad', label: e.reason === 'aborted' ? 'interrumpido' : 'algo falló' })
      timer = $.clock.after(CELEBRATE_MS, () => void rest($))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal') {
      return next(e)
    }

    const pet = await read($, state)
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>{FACES[pet.mood]} {pet.label}</Text>
  })
}
