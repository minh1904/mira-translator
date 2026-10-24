import type { NetworkBroker } from './broker'

export type SourceAccessErrorCode = 'not_found' | 'temporarily_unavailable' | 'http_error'

export class SourceAccessError extends Error {
  constructor(
    readonly code: SourceAccessErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'SourceAccessError'
  }
}

/** GET through the broker and decode UTF-8; non-200 statuses become typed errors. */
export async function fetchText(
  broker: NetworkBroker,
  url: string,
  signal: AbortSignal
): Promise<string> {
  const response = await broker.request({ url, method: 'GET', signal })
  if (response.status === 404 || response.status === 410) {
    throw new SourceAccessError('not_found', 'Nguồn không còn trang này (đã xóa hoặc sai địa chỉ)')
  }
  if (response.status === 429 || response.status >= 500) {
    throw new SourceAccessError(
      'temporarily_unavailable',
      `Nguồn tạm thời không truy cập được (HTTP ${response.status}); thử lại sau`
    )
  }
  if (response.status !== 200) {
    throw new SourceAccessError('http_error', `Nguồn trả HTTP ${response.status}`)
  }
  return new TextDecoder('utf-8').decode(response.body)
}
