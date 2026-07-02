// The privacy vault's front door, in place of the editor.
//
// Not a dialog: while the vault is locked there is nothing to edit, so the
// whole right-hand side becomes this. Four states, and the order between them
// is what keeps the vault closed — "forgot password" leads to setting a new one
// and cannot lead anywhere else.
//
// Two things this screen has to say out loud rather than imply:
//
// - **The security answer is a second password.** It opens everything the
//   password opens, so a question like "my first school" makes the whole vault
//   as strong as that answer. The user is entitled to know that before choosing.
// - **The growing delay after a wrong password only slows down this window.**
//   Anyone holding a copy of the vault folder can try passwords against it
//   offline as fast as they like.

import { useEffect, useState } from 'react'
import { KeyRound, Lock, ShieldQuestion } from 'lucide-react'
import {
  createVault,
  resetVaultPassword,
  unlockVaultWithPassword,
  unlockVaultWithRecovery,
} from './api/vault'
import type { VaultStatus } from './api/vault'
import { useLocale } from './locales'

type VaultAuthProps = {
  status: VaultStatus
  /** Handed up once the vault is open, and never anything derived from a key. */
  onUnlocked: (sessionHandle: string) => void
  onCancel: () => void
}

type Stage = 'create' | 'unlock' | 'recover' | 'reset'

export function VaultAuth({ status, onUnlocked, onCancel }: VaultAuthProps) {
  const strings = useLocale()
  const text = strings.vault
  const [stage, setStage] = useState<Stage>(status.initialized ? 'unlock' : 'create')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [answerConfirmation, setAnswerConfirmation] = useState('')
  /** Held only between the recovery unlock and the new password it forces. */
  const [recovered, setRecovered] = useState<string | null>(null)

  useEffect(() => {
    setStage(status.initialized ? 'unlock' : 'create')
  }, [status.initialized])

  function clear() {
    setPassword('')
    setConfirmation('')
    setAnswer('')
    setAnswerConfirmation('')
  }

  /**
   * Runs one attempt.
   *
   * A failed *credential* always reads the same — "wrong, or damaged" — and that
   * is not vagueness for its own sake: AES-GCM cannot tell a wrong key from a
   * corrupted box, so a message that distinguished them would be inventing
   * information it does not have. Everything else (a vault that already exists,
   * a password that is too short) says what it is, because those are known.
   */
  async function attempt(run: () => Promise<void>, unified = false) {
    setBusy(true)
    setError('')
    try {
      await run()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(unified || !message ? text.rejected : message)
    }
    setBusy(false)
  }

  function submitCreate() {
    void attempt(async () => {
      const session = await createVault({
        password,
        passwordConfirmation: confirmation,
        securityQuestion: question,
        securityAnswer: answer,
        securityAnswerConfirmation: answerConfirmation,
      })
      clear()
      onUnlocked(session.sessionHandle)
    })
  }

  function submitUnlock() {
    void attempt(async () => {
      const session = await unlockVaultWithPassword(password)
      clear()
      onUnlocked(session.sessionHandle)
    }, true)
  }

  function submitRecovery() {
    void attempt(async () => {
      const session = await unlockVaultWithRecovery(answer)
      clear()
      // Open, but not finished: the vault stays behind this screen until a new
      // password has been set, so recovering never leaves it without one.
      setRecovered(session.sessionHandle)
      setStage('reset')
    }, true)
  }

  function submitReset() {
    const session = recovered
    if (!session) return
    void attempt(async () => {
      await resetVaultPassword(session, password, confirmation)
      clear()
      setRecovered(null)
      onUnlocked(session)
    })
  }

  const invalid =
    stage === 'create'
      ? password.length < 8 ||
        password !== confirmation ||
        question.trim().length < 4 ||
        answer.trim().length < 2 ||
        answer.trim() !== answerConfirmation.trim()
      : stage === 'reset'
        ? password.length < 8 || password !== confirmation
        : stage === 'recover'
          ? answer.trim().length < 2
          : password.length === 0

  return (
    <div className="vault-auth" data-no-drag>
      <div className="vault-auth-head">
        {stage === 'recover' ? (
          <ShieldQuestion size={18} aria-hidden="true" />
        ) : stage === 'unlock' ? (
          <Lock size={18} aria-hidden="true" />
        ) : (
          <KeyRound size={18} aria-hidden="true" />
        )}
        <span>
          {stage === 'create'
            ? text.createTitle
            : stage === 'unlock'
              ? text.unlockTitle
              : stage === 'recover'
                ? text.recoverTitle
                : text.resetTitle}
        </span>
      </div>

      {stage === 'create' && (
        <>
          <p className="vault-auth-note">{text.createBody}</p>
          <label className="vault-field">
            <span>{text.password}</span>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="vault-field">
            <span>{text.passwordAgain}</span>
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <label className="vault-field">
            <span>{text.question}</span>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <label className="vault-field">
            <span>{text.answer}</span>
            <input
              type="password"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />
          </label>
          <label className="vault-field">
            <span>{text.answerAgain}</span>
            <input
              type="password"
              value={answerConfirmation}
              onChange={(event) => setAnswerConfirmation(event.target.value)}
            />
          </label>
          <p className="vault-auth-warning">{text.answerWarning}</p>
          <p className="vault-auth-warning">{text.questionWarning}</p>
        </>
      )}

      {stage === 'unlock' && (
        <>
          <label className="vault-field">
            <span>{text.password}</span>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !invalid && !busy) submitUnlock()
              }}
            />
          </label>
          <button
            type="button"
            className="vault-link"
            onClick={() => {
              setError('')
              setStage('recover')
            }}
          >
            {text.forgot}
          </button>
        </>
      )}

      {stage === 'recover' && (
        <>
          <p className="vault-auth-note">{status.securityQuestion}</p>
          <label className="vault-field">
            <span>{text.answer}</span>
            <input
              type="password"
              value={answer}
              autoFocus
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !invalid && !busy) submitRecovery()
              }}
            />
          </label>
          <button
            type="button"
            className="vault-link"
            onClick={() => {
              setError('')
              setStage('unlock')
            }}
          >
            {text.backToPassword}
          </button>
        </>
      )}

      {stage === 'reset' && (
        <>
          <p className="vault-auth-note">{text.resetBody}</p>
          <label className="vault-field">
            <span>{text.newPassword}</span>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="vault-field">
            <span>{text.passwordAgain}</span>
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
        </>
      )}

      {error && <p className="vault-auth-error">{error}</p>}
      <p className="vault-auth-note">{text.delayNote}</p>

      <div className="vault-auth-actions">
        {stage !== 'reset' && (
          <button type="button" className="reminder-button" onClick={onCancel} disabled={busy}>
            {strings.common.cancel}
          </button>
        )}
        <button
          type="button"
          className="reminder-button primary"
          disabled={invalid || busy}
          onClick={() => {
            if (stage === 'create') submitCreate()
            else if (stage === 'unlock') submitUnlock()
            else if (stage === 'recover') submitRecovery()
            else submitReset()
          }}
        >
          {busy
            ? text.working
            : stage === 'create'
              ? text.createAction
              : stage === 'reset'
                ? text.resetAction
                : text.unlockAction}
        </button>
      </div>
    </div>
  )
}

export default VaultAuth
