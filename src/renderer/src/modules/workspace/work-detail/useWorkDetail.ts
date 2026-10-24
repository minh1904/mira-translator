import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkPatch, WorkSummary } from '../../../../../shared/contracts/library'
import type { Result } from '../../../../../shared/contracts/result'
import { onAgentWorkUpdate } from '@renderer/modules/agent/public'
import { CoverImageError, fileToCoverDataUrl } from '../../library/public'
import { describe } from '../../library/public'
import { toWork, type Work } from '../../library/public'

export type WorkDetailLoad = 'loading' | 'ready' | 'failed'

export interface WorkDetailController {
  load: WorkDetailLoad
  work: Work | null
  /** Lý do không mở được tác phẩm để hiển thị cho người dùng. */
  loadError: string | null
  /** Thông báo lỗi hành động gần nhất, hiển thị cho đến khi bị đóng. */
  notice: string | null
  dismissNotice(): void
  reportNotice(message: string): void
  reload(): Promise<void>
  /** Tiếp nhận tác phẩm trả về từ thay đổi chương để cập nhật ngay phần đầu trang. */
  applyWork(summary: WorkSummary): void
  /** Trả về tác phẩm đã lưu, hoặc lỗi để hiển thị trên biểu mẫu chỉnh sửa. */
  update(patch: WorkPatch): Promise<Result<Work>>
  setPaused(paused: boolean): Promise<void>
  setArchived(archived: boolean): Promise<void>
  /** Thay ảnh bìa bằng `file`, hoặc gỡ bỏ khi `file` là null. */
  setCover(file: File | null): Promise<void>
}

/**
 * Quản lý dữ liệu tác phẩm hiển thị trên màn hình chi tiết.
 * `onChanged` giúp đồng bộ mọi thay đổi về danh sách thư viện.
 */
export function useWorkDetail(
  workId: string,
  onChanged?: (summary: WorkSummary) => void
): WorkDetailController {
  const [load, setLoad] = useState<WorkDetailLoad>('loading')
  const [work, setWork] = useState<Work | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Chỉ phản hồi mới nhất mới được ghi state, tránh phản hồi chậm ghi đè dữ liệu mới hơn
  const latest = useRef(0)
  const changed = useRef(onChanged)
  useEffect(() => {
    changed.current = onChanged
  })

  const take = useCallback((summary: WorkSummary): Work => {
    const next = toWork(summary)
    setWork(next)
    setLoad('ready')
    setLoadError(null)
    changed.current?.(summary)
    return next
  }, [])

  const apply = useCallback(
    (result: Result<WorkSummary>): void => {
      if (result.ok) {
        take(result.value)
      } else {
        setLoad('failed')
        setLoadError(describe(result.error))
      }
    },
    [take]
  )

  const reload = useCallback(async (): Promise<void> => {
    const ticket = ++latest.current
    const result = await window.mira.works.get(workId)
    if (ticket === latest.current) apply(result)
  }, [workId, apply])

  useEffect(() => {
    const ticket = ++latest.current
    void window.mira.works.get(workId).then((result) => {
      if (ticket === latest.current) apply(result)
    })
  }, [workId, apply])

  useEffect(() => onAgentWorkUpdate(() => void reload()), [reload])

  const update = useCallback(
    async (patch: WorkPatch): Promise<Result<Work>> => {
      const result = await window.mira.works.update(workId, patch)
      if (!result.ok) return result
      return { ok: true, value: take(result.value) }
    },
    [workId, take]
  )

  const act = useCallback(
    async (patch: WorkPatch, failure: string): Promise<void> => {
      const result = await update(patch)
      if (!result.ok) setNotice(failure + ': ' + describe(result.error))
    },
    [update]
  )

  const setPaused = useCallback(
    (paused: boolean) =>
      act({ status: paused ? 'paused' : 'in-progress' }, 'Không đổi được trạng thái'),
    [act]
  )

  const setArchived = useCallback(
    (archived: boolean) => act({ archived }, 'Không đổi được trạng thái lưu trữ'),
    [act]
  )

  const setCover = useCallback(
    async (file: File | null): Promise<void> => {
      let cover: string | null = null
      if (file) {
        try {
          cover = await fileToCoverDataUrl(file)
        } catch (error) {
          setNotice(
            'Không đổi được ảnh bìa: ' +
              (error instanceof CoverImageError ? error.message : 'Không xử lý được ảnh này.')
          )
          return
        }
      }
      await act({ cover }, 'Không đổi được ảnh bìa')
    },
    [act]
  )

  const dismissNotice = useCallback(() => setNotice(null), [])

  return {
    load,
    work,
    loadError,
    notice,
    dismissNotice,
    reportNotice: setNotice,
    reload,
    applyWork: take,
    update,
    setPaused,
    setArchived,
    setCover
  }
}
