import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChapterItem } from '../../../../../shared/contracts/chapters'
import type { WorkSummary } from '../../../../../shared/contracts/library'
import type { TextRecord } from '../../../../../shared/contracts/text'
import { describe } from '../../library/public'
import { toWork, type Work } from '../../library/public'
import { describeChapterError } from '../work-detail/useChapters'

export type ChapterScreenLoad = 'loading' | 'ready' | 'failed'

export interface ChapterScreenController {
  load: ChapterScreenLoad
  work: Work | null
  chapter: ChapterItem | null
  /** Văn bản gốc kèm các segment; revision 0 và rỗng nếu chưa từng nhập. */
  source: TextRecord | null
  /** Bản dịch; revision 0 và rỗng cho đến khi có nội dung được lưu. */
  target: TextRecord | null
  error: string | null
  reload(): Promise<void>
  /**
   * Thay đổi mỗi khi bản gốc bị thay thế từ bên ngoài trình soạn thảo (nhập lại),
   * yêu cầu mở lại trình soạn thảo với nội dung mới.
   */
  epoch: number
  /**
   * Thay đổi mỗi khi bản dịch được viết lại từ bên ngoài trình soạn thảo (AI dịch cả chương),
   * yêu cầu mở lại trình soạn thảo với nội dung mới.
   */
  targetEpoch: number
  /** Tiếp nhận bản gốc vừa được thay thế và cập nhật tác phẩm trong thư viện. */
  applySource(record: TextRecord): Promise<void>
  /** Tiếp nhận bản dịch được ghi lại từ bên ngoài và mở lại trình soạn thảo. */
  applyTarget(record: TextRecord): Promise<void>
  /** Ghi nhận trình soạn thảo đã lưu (hoặc tải lại) để cập nhật số liệu. */
  noteSaved(record: TextRecord): Promise<void>
  /** Ghi nhận trình soạn thảo bản dịch đã lưu (hoặc tải lại) để cập nhật chương và tác phẩm. */
  noteTargetSaved(record: TextRecord): Promise<void>
}

interface Loaded {
  work: Work
  chapter: ChapterItem
  source: TextRecord
  target: TextRecord
}

/** Quản lý toàn bộ dữ liệu hiển thị trên màn hình chương: tác phẩm, chương, bản gốc và bản dịch. */
export function useChapterScreen(
  workId: string,
  chapterId: string,
  onWorkChanged: (summary: WorkSummary) => void
): ChapterScreenController {
  const [load, setLoad] = useState<ChapterScreenLoad>('loading')
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [targetEpoch, setTargetEpoch] = useState(0)
  const latest = useRef(0)
  const changed = useRef(onWorkChanged)
  useEffect(() => {
    changed.current = onWorkChanged
  })

  const fetchAll = useCallback(async (): Promise<
    { ok: true; value: Loaded } | { ok: false; message: string }
  > => {
    const [work, chapters, source, target] = await Promise.all([
      window.mira.works.get(workId),
      window.mira.chapters.list(workId),
      window.mira.text.get(workId, chapterId, 'source'),
      window.mira.text.get(workId, chapterId, 'target')
    ])
    if (!work.ok) return { ok: false, message: describe(work.error) }
    if (!chapters.ok) return { ok: false, message: describeChapterError(chapters.error) }
    if (!source.ok) return { ok: false, message: describeChapterError(source.error) }
    if (!target.ok) return { ok: false, message: describeChapterError(target.error) }
    const chapter = chapters.value.chapters.find((item) => item.id === chapterId)
    if (!chapter) return { ok: false, message: 'Không tìm thấy chương này; có thể nó đã bị xóa.' }
    return {
      ok: true,
      value: { work: toWork(work.value), chapter, source: source.value, target: target.value }
    }
  }, [workId, chapterId])

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>): void => {
    if (result.ok) {
      setData(result.value)
      setLoad('ready')
      setError(null)
    } else {
      setLoad('failed')
      setError(result.message)
    }
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    const ticket = ++latest.current
    const result = await fetchAll()
    if (ticket === latest.current) apply(result)
  }, [fetchAll, apply])

  useEffect(() => {
    const ticket = ++latest.current
    void fetchAll().then((result) => {
      if (ticket === latest.current) apply(result)
    })
  }, [fetchAll, apply])

  const takeSource = useCallback(
    async (record: TextRecord, replaced: boolean): Promise<void> => {
      if (replaced) setEpoch((value) => value + 1)
      setData((current) =>
        current
          ? {
              ...current,
              source: record,
              chapter: { ...current.chapter, hasSource: record.content !== '' }
            }
          : current
      )
      const work = await window.mira.works.get(workId)
      if (work.ok) {
        changed.current(work.value)
        setData((current) => (current ? { ...current, work: toWork(work.value) } : current))
      }
    },
    [workId]
  )
  const applySource = useCallback((record: TextRecord) => takeSource(record, true), [takeSource])
  const noteSaved = useCallback((record: TextRecord) => takeSource(record, false), [takeSource])
  const takeTarget = useCallback(
    async (record: TextRecord, replaced: boolean): Promise<void> => {
      if (replaced) setTargetEpoch((value) => value + 1)
      setData((current) =>
        current
          ? {
              ...current,
              target: record,
              chapter: { ...current.chapter, hasTarget: record.content !== '' }
            }
          : current
      )
      const work = await window.mira.works.get(workId)
      if (work.ok) {
        changed.current(work.value)
        setData((current) => (current ? { ...current, work: toWork(work.value) } : current))
      }
    },
    [workId]
  )
  const noteTargetSaved = useCallback(
    (record: TextRecord) => takeTarget(record, false),
    [takeTarget]
  )
  const applyTarget = useCallback((record: TextRecord) => takeTarget(record, true), [takeTarget])

  return {
    load,
    work: data?.work ?? null,
    chapter: data?.chapter ?? null,
    source: data?.source ?? null,
    target: data?.target ?? null,
    error,
    reload,
    epoch,
    targetEpoch,
    applySource,
    applyTarget,
    noteSaved,
    noteTargetSaved
  }
}
