import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionView } from '../../../../../shared/contracts/aiConnections'
import type {
  SegmentRefusal,
  TranslateFailure,
  TranslateUsage
} from '../../../../../shared/contracts/aiTranslate'
import type {
  ParagraphTranslationPlan,
  TranslationPolicy
} from '../../../../../shared/contracts/aiTranslateProposals'
import type { TextRecord } from '../../../../../shared/contracts/text'
import { useConnectionStore } from '../../ai-connections/public'
import { describe } from '../../library/public'
import type { ModelSelection } from '../../ai-connections/public'
import { thinkingPatch, type ThinkingChoice } from '../../ai-connections/public'
import { continueTargetOf, targetKey, targetsOf, type TranslateTarget } from './translateTargets'
import { tallyBatch } from './translateRun'

type Stage = 'choosing' | 'planning' | 'ready' | 'running' | 'cancelling' | 'finished'

export interface ParagraphTranslateController {
  stage: Stage
  targets: TranslateTarget[]
  connections: ConnectionView[]
  selection: ModelSelection | null
  pick(selection: ModelSelection, choice?: ThinkingChoice): Promise<void>
  loadingTargets: boolean
  plan: ParagraphTranslationPlan | null
  policy: TranslationPolicy
  setPolicy(policy: TranslationPolicy): void
  notice: string | null
  dismissNotice(): void
  progress: { processed: number; proposed: number; total: number }
  failed: string[]
  failure: TranslateFailure | null
  /** Đoạn bộ lọc nội dung chặn trong lượt này, kèm lý do; thử lại cũng vô ích. */
  refusals: SegmentRefusal[]
  usage: TranslateUsage | null
  keyNotice: string | null
  /** Thông báo khi ngữ cảnh thay đổi sau khi lập kế hoạch; lượt chạy vẫn dùng ngữ cảnh lúc bắt đầu. */
  contextNotice: string | null
  /** Thông báo khi sắp dùng hết hoặc đã dùng hết hạn mức lời gọi API cho phép. */
  budgetNotice: string | null
  cancelled: boolean
  result: { proposed: number; applied: number; needsReview: number } | null
  start(): Promise<void>
  retryFailed(): Promise<void>
  /**
   * Model dự phòng trong Cài đặt được đề xuất khi lượt dịch bị dừng bởi lỗi có thể khắc phục bằng model khác.
   */
  continueTarget: TranslateTarget | null
  continueWithFallback(): void
  /** Thông báo thông tin chuyển đổi sang model dự phòng khi dịch tiếp. */
  fallbackNotice: string | null
  cancel(): void
}

export function useParagraphTranslate(
  workId: string,
  chapterId: string,
  onWritten: (record: TextRecord) => void
): ParagraphTranslateController {
  const connections = useConnectionStore((s) => s.connections)
  const connectionLoad = useConnectionStore((s) => s.load)
  const [picked, setPicked] = useState<string | null>(null)
  const [plan, setPlan] = useState<ParagraphTranslationPlan | null>(null)
  const [plannedKey, setPlannedKey] = useState<string | null>(null)
  const [policy, setPolicy] = useState<TranslationPolicy>('review')
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [finished, setFinished] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const [failure, setFailure] = useState<TranslateFailure | null>(null)
  const [refusals, setRefusals] = useState<SegmentRefusal[]>([])
  const [usage, setUsage] = useState<TranslateUsage | null>(null)
  const [keyNotice, setKeyNotice] = useState<string | null>(null)
  const [contextNotice, setContextNotice] = useState<string | null>(null)
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [result, setResult] = useState<ParagraphTranslateController['result']>(null)
  const [replan, setReplan] = useState(0)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  /** Giới hạn số lượng đoạn văn cần xử lý khi tiếp tục lượt dịch dở dang. */
  const [scopeTotal, setScopeTotal] = useState<number | null>(null)
  /** Danh sách ID các đoạn văn chưa dịch được chuyển tiếp sang kế hoạch dịch mới. */
  const pendingContinue = useRef<{ ids: string[]; key: string } | null>(null)
  const continueRun = useRef<((plan: ParagraphTranslationPlan, ids: string[]) => void) | null>(null)
  const stop = useRef(false)
  const live = useRef(true)
  const written = useRef(onWritten)
  const proposedIds = useRef(new Set<string>())
  const processedIds = useRef(new Set<string>())
  useEffect(() => {
    written.current = onWritten
  })
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      stop.current = true
    }
  }, [])

  const main = useConnectionStore((state) => state.preferences?.main ?? null)
  const targets = useMemo(() => targetsOf(connections ?? [], main), [connections, main])
  const enabledConnections = useMemo(
    () => (connections ?? []).filter((item) => item.enabled),
    [connections]
  )
  const chosen =
    picked ?? (targets[0] ? targetKey(targets[0].connectionId, targets[0].entryId) : null)
  const current = useMemo(
    () => targets.find((item) => targetKey(item.connectionId, item.entryId) === chosen) ?? null,
    [targets, chosen]
  )

  const pick = useCallback(
    async (selection: ModelSelection, choice?: ThinkingChoice): Promise<void> => {
      setPicked(targetKey(selection.connectionId, selection.entryId))
      if (choice === undefined) return
      const outcome = await useConnectionStore.getState().entries.update(selection.entryId, {
        settings: thinkingPatch(choice)
      })
      if (live.current && !outcome.ok) setNotice(outcome.message)
    },
    []
  )

  useEffect(() => {
    if (connectionLoad === 'loading') void useConnectionStore.getState().reload()
  }, [connectionLoad])

  useEffect(() => {
    if (!current) return
    let active = true
    const key = targetKey(current.connectionId, current.entryId)
    void window.mira.ai.translate
      .paragraphPlan({
        workId,
        chapterId,
        connectionId: current.connectionId,
        entryId: current.entryId
      })
      .then((response) => {
        if (!live.current || !active) return
        setPlannedKey(key)
        setPlan(response.ok ? response.value : null)
        if (!response.ok) setNotice(describe(response.error))
        const carried = pendingContinue.current
        if (response.ok && carried && carried.key === key) {
          pendingContinue.current = null
          continueRun.current?.(response.value, carried.ids)
        }
      })
    return () => {
      active = false
    }
  }, [workId, chapterId, current, replan])

  const settled = plannedKey === chosen
  let stage: Stage = 'choosing'
  if (running) stage = stopping ? 'cancelling' : 'running'
  else if (finished) stage = 'finished'
  else if (!settled) stage = targets.length ? 'planning' : 'choosing'
  else if (plan) stage = 'ready'

  const runBatches = useCallback(
    async (
      sourceGroups: string[][],
      activePlan: ParagraphTranslationPlan,
      retry = false
    ): Promise<void> => {
      stop.current = false
      setStopping(false)
      setCancelled(false)
      setFailure(null)
      setKeyNotice(null)
      setContextNotice(null)
      setBudgetNotice(null)
      let warned = false
      setFinished(false)
      setRunning(true)
      let lastTail: string | null = null
      let spent: TranslateUsage | null = null
      let localFailed: string[] = []
      let localRefusals: SegmentRefusal[] = []
      let proposedCount = proposedIds.current.size
      let haltedByError = false
      let nextIndex = 0
      for (; nextIndex < sourceGroups.length; nextIndex++) {
        const sourceIds = sourceGroups[nextIndex]
        if (stop.current) break
        const response = await window.mira.ai.translate.paragraphBatch({
          workId,
          chapterId,
          runId: activePlan.runId,
          connectionId: activePlan.connectionId,
          entryId: activePlan.entryId,
          settingsKey: activePlan.settingsKey,
          sourceRev: activePlan.sourceRev,
          targetRev: activePlan.targetRev,
          targetBaseContent: activePlan.targetBaseContent,
          policy,
          sourceIds,
          ...(retry ? { retry: true } : {})
        })
        if (!response.ok) {
          setFailure({
            kind: 'conflict',
            message: describe(response.error),
            recoverAt: null,
            haltsRun: true
          })
          localFailed = [...new Set([...localFailed, ...sourceIds])]
          if (response.error.code === 'conflict') setReplan((value) => value + 1)
          haltedByError = true
          break
        }
        const batch = response.value
        for (const id of sourceIds) processedIds.current.add(id)
        setProcessed(processedIds.current.size)
        for (const id of batch.proposed) proposedIds.current.add(id)
        proposedCount = proposedIds.current.size
        setDone(proposedCount)
        const tally = tallyBatch(
          { failed: localFailed, refusals: localRefusals, halted: false },
          batch
        )
        localFailed = tally.failed
        if (batch.refusals.length > 0) {
          localRefusals = tally.refusals
          setRefusals(localRefusals)
        }
        if (batch.usage) {
          const previous = spent
          const sumOpt = (a?: number, b?: number): number | undefined =>
            a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
          const next: TranslateUsage = {
            inputTokens: (previous?.inputTokens ?? 0) + batch.usage.inputTokens,
            outputTokens: (previous?.outputTokens ?? 0) + batch.usage.outputTokens,
            source: 'provider',
            complete: (previous?.complete ?? true) && batch.usage.complete
          }
          const uncached = sumOpt(previous?.uncachedInputTokens, batch.usage.uncachedInputTokens)
          const cacheRead = sumOpt(previous?.cacheReadTokens, batch.usage.cacheReadTokens)
          const cacheWrite = sumOpt(previous?.cacheWriteTokens, batch.usage.cacheWriteTokens)
          const reasoning = sumOpt(previous?.reasoningTokens, batch.usage.reasoningTokens)
          if (uncached !== undefined) next.uncachedInputTokens = uncached
          if (cacheRead !== undefined) next.cacheReadTokens = cacheRead
          if (cacheWrite !== undefined) next.cacheWriteTokens = cacheWrite
          if (reasoning !== undefined) next.reasoningTokens = reasoning
          spent = next
          setUsage(spent)
        }
        // Ngân sách lời gọi của lượt (main giữ): báo một lần khi đã dùng 80%, và khi đã hết.
        if (batch.budgetIds.length > 0) {
          setBudgetNotice(
            `Lượt dịch đã dùng hết ${batch.budget.limit} lời gọi cho phép; ` +
              'các đoạn chưa xong có thể thử lại riêng.'
          )
        } else if (batch.budget.warn && !warned) {
          warned = true
          setBudgetNotice(
            `Lượt dịch đã dùng ${batch.budget.used}/${batch.budget.limit} lời gọi cho phép.`
          )
        }
        if (batch.contextChanged) {
          setContextNotice(
            'Glossary, nhân vật, xưng hô hoặc bối cảnh truyện đã đổi sau khi lập kế hoạch. Lượt này vẫn dùng ' +
              'ngữ cảnh lúc bắt đầu; lập kế hoạch lại để áp dụng thay đổi.'
          )
        }
        if (batch.keyTail) {
          if (lastTail && batch.keyTail !== lastTail) {
            setKeyNotice(`Khóa …${lastTail} hết hạn mức, đã chuyển sang khóa …${batch.keyTail}.`)
          }
          lastTail = batch.keyTail
        }
        if (batch.error) setFailure(batch.error)
        // Xử lý các loại lỗi có dừng lượt chạy hay không; các đoạn bị chặn bởi bộ lọc nội dung không làm dừng các lô khác.
        if (tally.halted) {
          haltedByError = true
          break
        }
      }
      if (nextIndex < sourceGroups.length) {
        localFailed = [...new Set([...localFailed, ...sourceGroups.slice(nextIndex).flat()])]
      }
      setFailed(localFailed)
      // Lượt dịch chưa hoàn tất vẫn lưu kết quả trong hàng chờ; tự động áp dụng chỉ chạy khi toàn bộ hoàn tất.
      if (!stop.current && !haltedByError && localFailed.length === 0) {
        const finalized = await window.mira.ai.translate.paragraphFinalize({
          workId,
          chapterId,
          runId: activePlan.runId,
          policy
        })
        if (finalized.ok) {
          setResult({
            proposed: finalized.value.proposed,
            applied: finalized.value.applied,
            needsReview: finalized.value.needsReview
          })
          if (finalized.value.applied > 0) {
            const latest = await window.mira.text.get(workId, chapterId, 'target')
            if (latest.ok) written.current(latest.value)
          }
        } else setNotice(describe(finalized.error))
      } else {
        setResult({ proposed: proposedCount, applied: 0, needsReview: proposedCount })
      }
      window.dispatchEvent(new Event('mira:proposals-changed'))
      if (!live.current) return
      setRunning(false)
      setFinished(true)
      setCancelled(stop.current)
    },
    [workId, chapterId, policy]
  )

  const start = useCallback(async (): Promise<void> => {
    if (!plan || !current) return
    setScopeTotal(null)
    setFallbackNotice(null)
    proposedIds.current.clear()
    processedIds.current.clear()
    setDone(0)
    setProcessed(0)
    setFailed([])
    setRefusals([])
    setUsage(null)
    setResult(null)
    await runBatches(
      plan.batches.map((batch) => batch.sourceIds),
      plan
    )
  }, [plan, current, runBatches])

  // Tiếp tục dịch các đoạn còn sót lại theo nhóm lô của kế hoạch mới.
  useEffect(() => {
    continueRun.current = (nextPlan, ids) => {
      const wanted = new Set(ids)
      const groups = nextPlan.batches
        .map((batch) => batch.sourceIds.filter((id) => wanted.has(id)))
        .filter((group) => group.length > 0)
      setScopeTotal(groups.flat().length)
      proposedIds.current.clear()
      processedIds.current.clear()
      setDone(0)
      setProcessed(0)
      setFailed([])
      setRefusals([])
      setUsage(null)
      setResult(null)
      void runBatches(groups, nextPlan)
    }
  })

  const fallbackTargets = useConnectionStore((state) => state.preferences?.fallbacks)
  const continueTarget = continueTargetOf({
    stopped: finished && !running,
    failureAllowsFallback: failure?.fallback === true,
    missing: failed.length,
    fallbacks: fallbackTargets ?? [],
    targets,
    current: chosen
  })

  const continueWithFallback = useCallback((): void => {
    if (!continueTarget || !current || !failure) return
    const key = targetKey(continueTarget.connectionId, continueTarget.entryId)
    pendingContinue.current = { ids: [...failed], key }
    setFallbackNotice(
      'Đã chuyển sang ' +
        continueTarget.label +
        ' cho ' +
        failed.length +
        ' đoạn còn lại vì ' +
        current.label +
        ': ' +
        failure.message
    )
    setFinished(false)
    setPicked(key)
  }, [continueTarget, current, failure, failed])

  const retryFailed = useCallback(async (): Promise<void> => {
    if (!plan || failed.length === 0) return
    const again = [...failed]
    setFailed([])
    // Người dùng bấm thử lại: main cấp thêm một phần ngân sách lời gọi cho lô này.
    await runBatches([again], plan, true)
  }, [plan, failed, runBatches])

  return {
    stage,
    targets,
    connections: enabledConnections,
    selection: current ? { connectionId: current.connectionId, entryId: current.entryId } : null,
    pick,
    loadingTargets: connections === null,
    plan: settled ? plan : null,
    policy,
    setPolicy,
    notice,
    dismissNotice: () => setNotice(null),
    progress: { processed, proposed: done, total: scopeTotal ?? plan?.paragraphCount ?? 0 },
    failed,
    failure,
    refusals,
    usage,
    keyNotice,
    contextNotice,
    budgetNotice,
    cancelled,
    result,
    start,
    retryFailed,
    continueTarget,
    continueWithFallback,
    fallbackNotice,
    cancel: () => {
      stop.current = true
      setStopping(true)
    }
  }
}
