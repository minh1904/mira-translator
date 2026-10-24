import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContextEntryItem } from '../../../../shared/contracts/glossary'
import { configureAiCallLog } from '../../../infra/storage/aiCallLog'
import { ProviderError } from '../../../infra/providers/types'
import { CallBudget } from './callBudget'
import { executeTranslateBatch, type TranslationModelCaller } from './translationCore'

describe('translationCore — AI call log', () => {
  it('logs the raw answer of each call and the text the app kept', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mira-core-log-'))
    configureAiCallLog(dataDir)
    try {
      const raw = JSON.stringify([{ id: '[1]', dst: 'Ở vương đô ấy...' }])
      await executeTranslateBatch({
        caller: { complete: async () => ({ text: raw, usage: null, finishReason: 'stop' }) },
        units: [{ id: 'u1', text: '「王都にはね……」' }],
        log: { workId: 'w1', chapterId: 'c1', runKey: 'r1', model: 'm' }
      })
      const records = readFileSync(join(dataDir, 'logs', 'w1.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
      expect(records.map((record) => record.kind)).toEqual(['translate.main', 'translate.result'])
      expect(records[0]).toMatchObject({ chapterId: 'c1', runKey: 'r1', model: 'm', raw })
      // The raw answer lost the quotes; the kept text has them back.
      expect(records[1]?.items).toEqual([
        { id: 'u1', src: '「王都にはね……」', dst: '“Ở vương đô ấy...”' }
      ])
    } finally {
      configureAiCallLog(null)
    }
  })
})

describe('translationCore — Điều phối Lõi dịch theo lô', () => {
  it('v4 chỉ lưu dst, bỏ nhãn và các trường chuẩn bị xưng gọi', async () => {
    const caller: TranslationModelCaller = {
      async complete() {
        return {
          text: JSON.stringify([
            {
              id: '[1]',
              speaker_to_listener: 'A→B',
              self_ref: 'tôi',
              addr_ref: 'cậu',
              dst: '“Cậu về rồi à?”'
            }
          ]),
          usage: null
        }
      }
    }
    const result = await executeTranslateBatch({
      caller,
      units: [{ id: 'u1', text: '「帰った？」' }]
    })
    expect(result.error).toBeNull()
    expect(result.failedIds).toEqual([])
    expect(result.items).toEqual([{ id: 'u1', text: '“Cậu về rồi à?”' }])
  })
  it('keeps Vietnamese quotes when the model answers with corner brackets', async () => {
    const result = await executeTranslateBatch({
      caller: {
        complete: async () => ({
          text: JSON.stringify([{ id: '[1]', dst: '「Serena bảo 『chuẩn bị』 nên tới muộn.」' }]),
          usage: null
        })
      },
      units: [{ id: 'u1', text: '「セレナが『準備』って言うから遅れた」' }]
    })
    expect(result.items).toEqual([{ id: 'u1', text: '“Serena bảo ‘chuẩn bị’ nên tới muộn.”' }])
  })
  it('dịch thành công lô bình thường và tính đúng usage', async () => {
    const caller: TranslationModelCaller = {
      async complete() {
        return {
          text: JSON.stringify([
            { id: '[1]', dst: 'Xin chào.' },
            { id: '[2]', dst: 'Tạm biệt.' }
          ]),
          usage: { inputTokens: 10, outputTokens: 8 }
        }
      }
    }

    const units = [
      { id: 'u1', text: 'Hello.' },
      { id: 'u2', text: 'Goodbye.' }
    ]

    const result = await executeTranslateBatch({ caller, units })

    expect(result.error).toBeNull()
    expect(result.failedIds).toHaveLength(0)
    expect(result.items).toEqual([
      { id: 'u1', text: 'Xin chào.' },
      { id: 'u2', text: 'Tạm biệt.' }
    ])
    expect(result.usage?.inputTokens).toBe(10)
    expect(result.usage?.outputTokens).toBe(8)
  })

  it('bỏ qua đơn vị rỗng mà không cần gửi tới mô hình', async () => {
    let called = false
    const caller: TranslationModelCaller = {
      async complete() {
        called = true
        return { text: '[]', usage: null }
      }
    }

    const units = [{ id: 'empty-1', text: '   ' }]
    const result = await executeTranslateBatch({ caller, units })

    expect(called).toBe(false)
    expect(result.items).toEqual([{ id: 'empty-1', text: '' }])
    expect(result.failedIds).toHaveLength(0)
    expect(result.error).toBeNull()
  })

  it('hỏi lại (repair) khi lượt đầu thiếu ID và ghép nối thành công', async () => {
    let callCount = 0
    const caller: TranslationModelCaller = {
      async complete(messages) {
        callCount++
        if (callCount === 1) {
          // Lượt 1: Chỉ trả ID [1], bỏ sót [2]
          return {
            text: JSON.stringify([{ id: '[1]', dst: 'Câu 1' }]),
            usage: { inputTokens: 10, outputTokens: 5 }
          }
        }
        // Lượt 2 (repair): Nhận prompt hỏi lại và trả ID [2]
        expect(messages[1].content).toContain('thiếu')
        return {
          text: JSON.stringify([{ id: '[2]', dst: 'Câu 2 bổ sung' }]),
          usage: { inputTokens: 5, outputTokens: 5 }
        }
      }
    }

    const units = [
      { id: 'u1', text: 'First' },
      { id: 'u2', text: 'Second' }
    ]

    const result = await executeTranslateBatch({ caller, units })

    expect(callCount).toBe(2)
    expect(result.failedIds).toHaveLength(0)
    expect(result.error).toBeNull()
    expect(result.items).toEqual([
      { id: 'u1', text: 'Câu 1' },
      { id: 'u2', text: 'Câu 2 bổ sung' }
    ])
    expect(result.usage?.inputTokens).toBe(15)
    expect(result.usage?.outputTokens).toBe(10)
  })

  it('xử lý lỗi khi kết quả bị cắt vì hết giới hạn đầu ra (finishReason: length)', async () => {
    const caller: TranslationModelCaller = {
      async complete() {
        return {
          text: '[{"id": "[1]',
          usage: { inputTokens: 50, outputTokens: 10 },
          finishReason: 'length'
        }
      }
    }

    const units = [{ id: 'u1', text: 'Văn bản rất dài...' }]
    const result = await executeTranslateBatch({ caller, units })

    expect(result.error?.kind).toBe('invalid_response')
    expect(result.failedIds).toEqual(['u1'])
    expect(result.items).toHaveLength(0)
  })

  it('giữ lại các câu thành công và báo lỗi khi hỏi lại vẫn thiếu ID', async () => {
    let callCount = 0
    const caller: TranslationModelCaller = {
      async complete() {
        callCount++
        // Cả lượt 1 và 2 đều chỉ trả [1], không bao giờ trả [2]
        return {
          text: JSON.stringify([{ id: '[1]', dst: 'Câu 1 duy nhất' }]),
          usage: { inputTokens: 10, outputTokens: 5 }
        }
      }
    }

    const units = [
      { id: 'u1', text: 'Sentence 1' },
      { id: 'u2', text: 'Sentence 2' }
    ]

    const result = await executeTranslateBatch({ caller, units })

    expect(callCount).toBe(2) // Đã thử hỏi lại một lần
    expect(result.items).toEqual([{ id: 'u1', text: 'Câu 1 duy nhất' }])
    expect(result.failedIds).toEqual(['u2'])
    expect(result.error?.kind).toBe('invalid_response')
    expect(result.error?.message).toContain('Thiếu 1 đoạn')
    expect(result.usage?.inputTokens).toBe(20)
  })

  it('xử lý phản hồi JSON hỏng hoàn toàn không thể cứu vãn', async () => {
    let callCount = 0
    const caller: TranslationModelCaller = {
      async complete() {
        callCount++
        return {
          text: 'Văn bản tự do không chứa JSON nào cả.',
          usage: { inputTokens: 10, outputTokens: 5 }
        }
      }
    }

    const units = [{ id: 'u1', text: 'Một đoạn văn' }]
    const result = await executeTranslateBatch({ caller, units })

    expect(callCount).toBe(2)
    expect(result.items).toHaveLength(0)
    expect(result.failedIds).toEqual(['u1'])
    expect(result.error?.kind).toBe('invalid_response')
  })

  it('chuyển tiếp lỗi ProviderError (timeout/network) với đúng kind và failedIds', async () => {
    const { ProviderError } = await import('../../../infra/providers/types')
    const caller: TranslationModelCaller = {
      async complete() {
        throw new ProviderError('timeout', 'Hết thời gian chờ phản hồi.')
      }
    }

    const units = [
      { id: 'u1', text: 'Unit 1' },
      { id: 'u2', text: 'Unit 2' }
    ]
    const result = await executeTranslateBatch({ caller, units })

    expect(result.error?.kind).toBe('timeout')
    expect(result.error?.message).toBe('Hết thời gian chờ phản hồi.')
    expect(result.failedIds).toEqual(['u1', 'u2'])
    expect(result.items).toHaveLength(0)
  })

  it('dừng và không gọi repair khi tín hiệu signal bị hủy (abort)', async () => {
    const controller = new AbortController()
    let callCount = 0

    const caller: TranslationModelCaller = {
      async complete() {
        callCount++
        // Sau khi hoàn thành lượt 1 thì người dùng bấm Hủy
        controller.abort()
        return {
          text: JSON.stringify([{ id: '[1]', dst: 'Đã xong trước khi hủy' }]),
          usage: { inputTokens: 10, outputTokens: 5 }
        }
      }
    }

    const units = [
      { id: 'u1', text: 'First' },
      { id: 'u2', text: 'Second' }
    ]

    const result = await executeTranslateBatch({
      caller,
      units,
      signal: controller.signal
    })

    // Chỉ gọi đúng 1 lần, không gửi tiếp lượt repair vì signal đã bị abort
    expect(callCount).toBe(1)
    expect(result.items).toEqual([{ id: 'u1', text: 'Đã xong trước khi hủy' }])
    expect(result.failedIds).toEqual(['u2'])
  })

  /**
   * Caller giả: chặn mọi request có đoạn chứa "XẤU", và đoạn chứa "NHẠY" khi request kèm glossary;
   * trả bản dịch cho phần còn lại.
   */
  function filteringCaller(): TranslationModelCaller & { calls: number } {
    const caller = {
      calls: 0,
      async complete(messages: Array<{ role: string; content: string }>) {
        caller.calls++
        const user = messages.find((message) => message.role === 'user')?.content ?? ''
        const source = JSON.parse(
          /<source>\n([\s\S]*?)\n<\/source>/.exec(user)?.[1] ?? '[]'
        ) as Array<{
          id: string
          src: string
        }>
        const withGlossary = user.includes('<glossary>')
        if (
          source.some(
            (item) => item.src.includes('XẤU') || (withGlossary && item.src.includes('NHẠY'))
          )
        ) {
          return { text: '', usage: { inputTokens: 1, outputTokens: 0 }, finishReason: 'filter' }
        }
        return {
          text: JSON.stringify(source.map((item) => ({ id: item.id, dst: 'vi:' + item.src }))),
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop'
        }
      }
    }
    return caller
  }

  it('lô bị bộ lọc nội dung chặn: chia đôi, cứu các đoạn vô can, chỉ báo đúng đoạn bị từ chối', async () => {
    const caller = filteringCaller()
    const units = ['a', 'b', 'c', 'XẤU', 'e', 'f'].map((text, i) => ({ id: `u${i + 1}`, text }))
    const result = await executeTranslateBatch({ caller, units })
    expect(result.items.map((item) => item.id).sort()).toEqual(['u1', 'u2', 'u3', 'u5', 'u6'])
    expect(result.items.find((item) => item.id === 'u5')?.text).toBe('vi:e')
    expect(result.refusedIds).toEqual(['u4'])
    expect(result.failedIds).toEqual(['u4'])
    expect(result.error?.kind).toBe('refused')
    // Lượt chính, rồi 3+3 → 2+1 → 1+1: đoạn xấu được gửi riêng một lần để chắc chính nó bị chặn, và không
    // bị hỏi lại thêm ở lượt hỏi lại.
    expect(caller.calls).toBe(7)
    expect(result.usage?.inputTokens).toBe(7)
  })

  it('không vượt trần số lời gọi khi mọi đoạn đều bị chặn', async () => {
    const caller = filteringCaller()
    const units = Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, text: 'XẤU ' + i }))
    const result = await executeTranslateBatch({ caller, units })
    expect(caller.calls).toBeLessThanOrEqual(1 + 16 + 1)
    expect(result.items).toEqual([])
    expect(result.failedIds).toHaveLength(40)
    expect(result.error?.kind).toBe('refused')
  })

  it('đoạn vẫn bị chặn thì gửi lại không kèm glossary; qua được thì đánh dấu, không thì báo từ chối', async () => {
    const caller = filteringCaller()
    const glossary: ContextEntryItem[] = [
      {
        id: 't',
        kind: 'term',
        source: 'a',
        target: 'A',
        status: 'approved',
        origin: 'user',
        forbidden: false,
        fromChapterId: null,
        toChapterId: null,
        notes: null,
        aliases: [],
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const units = ['a NHẠY', 'b', 'XẤU', 'd'].map((text, i) => ({ id: `u${i + 1}`, text }))
    const result = await executeTranslateBatch({ caller, units, prompt: { glossary } })
    expect(result.items.map((item) => item.id).sort()).toEqual(['u1', 'u2', 'u4'])
    expect(result.withoutContextIds).toEqual(['u1'])
    expect(result.refusedIds).toEqual(['u3'])
    expect(result.error?.kind).toBe('refused')
    // Lượt chính, chia 2+2 → 1+1 và 1+1, rồi gửi lại hai đoạn bị chặn không kèm glossary → 1+1.
    expect(caller.calls).toBe(10)
  })

  it('ghi lý do chặn riêng cho từng đoạn, và đếm theo lý do trong thông báo', async () => {
    // Đoạn chứa "AN_TOAN" bị chặn vì SAFETY, đoạn chứa "TRICH" vì RECITATION; request có cả hai thì lấy
    // lý do của đoạn đầu tiên, như bộ lọc thật chỉ nêu một lý do cho cả request.
    const caller: TranslationModelCaller = {
      async complete(messages) {
        const user = messages.find((message) => message.role === 'user')?.content ?? ''
        const source = JSON.parse(
          /<source>\n([\s\S]*?)\n<\/source>/.exec(user)?.[1] ?? '[]'
        ) as Array<{ id: string; src: string }>
        const blocked = source.find(
          (item) => item.src.includes('AN_TOAN') || item.src.includes('TRICH')
        )
        if (blocked) {
          const raw = blocked.src.includes('AN_TOAN') ? 'SAFETY' : 'RECITATION'
          return {
            text: '',
            usage: null,
            finishReason: 'filter',
            filter: { group: raw === 'SAFETY' ? 'safety' : 'recitation', raw }
          }
        }
        return {
          text: JSON.stringify(source.map((item) => ({ id: item.id, dst: 'vi:' + item.src }))),
          usage: null,
          finishReason: 'stop'
        }
      }
    }
    const units = ['a', 'AN_TOAN', 'c', 'TRICH'].map((text, i) => ({ id: `u${i + 1}`, text }))
    const result = await executeTranslateBatch({ caller, units })
    expect(result.refusals).toEqual([
      { id: 'u2', group: 'safety', raw: 'SAFETY' },
      { id: 'u4', group: 'recitation', raw: 'RECITATION' }
    ])
    expect(result.refusedIds).toEqual(result.refusals.map((refusal) => refusal.id))
    expect(result.error?.message).toContain('1 đoạn bị bộ lọc an toàn chặn')
    expect(result.error?.message).toContain(
      '1 đoạn bị bộ lọc trích dẫn chặn (không phải vấn đề nội dung)'
    )
  })

  it('đoạn qua được ở vòng không kèm ngữ cảnh thì không còn lý do chặn', async () => {
    const caller = filteringCaller()
    const glossary: ContextEntryItem[] = [
      {
        id: 't',
        kind: 'term',
        source: 'a',
        target: 'A',
        status: 'approved',
        origin: 'user',
        forbidden: false,
        fromChapterId: null,
        toChapterId: null,
        notes: null,
        aliases: [],
        createdAt: 1,
        updatedAt: 1
      }
    ]
    const units = ['a NHẠY', 'b'].map((text, i) => ({ id: `u${i + 1}`, text }))
    const result = await executeTranslateBatch({ caller, units, prompt: { glossary } })
    expect(result.withoutContextIds).toEqual(['u1'])
    expect(result.refusals).toEqual([])
    expect(result.error).toBeNull()
  })

  it('đoạn bị chặn mà nhà cung cấp không nêu lý do thì vào nhóm other', async () => {
    const caller = filteringCaller()
    const units = ['a', 'XẤU'].map((text, i) => ({ id: `u${i + 1}`, text }))
    const result = await executeTranslateBatch({ caller, units })
    expect(result.refusals).toEqual([{ id: 'u2', group: 'other', raw: '' }])
  })

  it('prompt không có glossary, nhân vật hay cặp xưng hô thì không gửi lại', async () => {
    const caller = filteringCaller()
    const units = ['a', 'XẤU'].map((text, i) => ({ id: `u${i + 1}`, text }))
    const result = await executeTranslateBatch({ caller, units })
    expect(result.withoutContextIds).toEqual([])
    expect(result.refusedIds).toEqual(['u2'])
    expect(caller.calls).toBe(3)
  })

  describe('ngân sách lời gọi của lượt', () => {
    it('hết ngân sách giữa lúc chia: giữ đoạn đã dịch, đoạn đã khoanh là bị chặn, phần còn lại hết ngân sách', async () => {
      const caller = filteringCaller()
      const budget = new CallBudget(1, 4)
      const units = ['a', 'b', 'c', 'XẤU', 'e', 'f'].map((text, i) => ({ id: `u${i + 1}`, text }))
      const result = await executeTranslateBatch({ caller, units, budget })
      // Lượt chính, rồi 4 lời gọi chia: [a,b,c] ✓, [XẤU,e,f] ✗, [XẤU,e] ✗, [XẤU] ✗; [e] và [f] không còn lời gọi.
      expect(caller.calls).toBe(5)
      expect(result.items.map((item) => item.id).sort()).toEqual(['u1', 'u2', 'u3'])
      expect(result.refusedIds).toEqual(['u4'])
      expect(result.budgetIds).toEqual(['u5', 'u6'])
      expect(result.failedIds.sort()).toEqual(['u4', 'u5', 'u6'])
      expect(result.error?.kind).toBe('refused')
      expect(result.error?.message).toContain('2 đoạn chưa xong vì hết ngân sách lời gọi')
      expect(budget.snapshot()).toMatchObject({ used: 5, byRound: { main: 1, split: 4 } })
    })

    it('chia lô và gửi lại không ngữ cảnh dùng chung một trần', async () => {
      const caller = filteringCaller()
      const budget = new CallBudget(1, 3)
      const glossary: ContextEntryItem[] = [
        {
          id: 't',
          kind: 'term',
          source: 'a',
          target: 'A',
          status: 'approved',
          origin: 'user',
          forbidden: false,
          fromChapterId: null,
          toChapterId: null,
          notes: null,
          aliases: [],
          createdAt: 1,
          updatedAt: 1
        }
      ]
      const units = ['a NHẠY', 'b', 'XẤU', 'd'].map((text, i) => ({ id: `u${i + 1}`, text }))
      await executeTranslateBatch({ caller, units, prompt: { glossary }, budget })
      expect(caller.calls).toBe(4)
      const { byRound } = budget.snapshot()
      expect(byRound.split + byRound.bare + byRound.repair).toBe(3)
    })

    it('không còn lời gọi cho lượt chính thì không gửi gì và báo hết ngân sách', async () => {
      const caller = filteringCaller()
      const result = await executeTranslateBatch({
        caller,
        units: [{ id: 'u1', text: 'a' }],
        budget: new CallBudget(0, 0)
      })
      expect(caller.calls).toBe(0)
      expect(result.budgetIds).toEqual(['u1'])
      expect(result.error?.kind).toBe('budget_exhausted')
    })

    it('không còn lời gọi để hỏi lại thì đoạn thiếu là hết ngân sách, không phải thiếu', async () => {
      const caller: TranslationModelCaller = {
        async complete() {
          return {
            text: '[{"id":"[1]","dst":"A"}]',
            usage: null,
            finishReason: 'stop',
            attempts: 3
          }
        }
      }
      const budget = new CallBudget(1, 0)
      const result = await executeTranslateBatch({
        caller,
        units: [
          { id: 'u1', text: 'a' },
          { id: 'u2', text: 'b' }
        ],
        budget
      })
      expect(result.budgetIds).toEqual(['u2'])
      expect(result.error?.kind).toBe('budget_exhausted')
      // Số request HTTP thật được ghi riêng, không trừ vào ngân sách.
      expect(budget.snapshot()).toMatchObject({ used: 1, httpAttempts: 3 })
    })
  })
})

describe('chế độ đầu ra có schema', () => {
  type Seen = { system: string; user: string; responseFormat?: unknown }

  /** Caller giả ghi lại từng lời gọi; `answer` quyết câu trả lời theo lời gọi thứ mấy. */
  function recordingCaller(
    answer: (seen: Seen, index: number) => Awaited<ReturnType<TranslationModelCaller['complete']>>
  ): TranslationModelCaller & { seen: Seen[] } {
    const seen: Seen[] = []
    return {
      seen,
      async complete(messages, options) {
        const entry: Seen = {
          system: messages[0].content,
          user: messages[1].content,
          ...(options && 'responseFormat' in options
            ? { responseFormat: options.responseFormat }
            : {})
        }
        seen.push(entry)
        return answer(entry, seen.length - 1)
      }
    }
  }

  const idsOf = (user: string): string[] =>
    (
      JSON.parse(/<source>\n([\s\S]*?)\n<\/source>/.exec(user)?.[1] ?? '[]') as Array<{
        id: string
      }>
    ).map((item) => item.id)

  const asObject = (ids: string[]): string =>
    JSON.stringify({ items: ids.map((id) => ({ id, dst: 'vi ' + id })) })

  const units = ['a', 'b', 'c'].map((text, i) => ({ id: `u${i + 1}`, text }))

  it('chế độ tắt thì không lời gọi nào có responseFormat', async () => {
    const caller = recordingCaller((seen) => ({
      text: JSON.stringify(idsOf(seen.user).map((id) => ({ id, dst: 'x' }))),
      usage: null
    }))
    const result = await executeTranslateBatch({ caller, units })
    expect(caller.seen.every((seen) => !('responseFormat' in seen))).toBe(true)
    expect(result.request?.outputMode).toBe('array')
  })

  it('chế độ object gửi schema và đọc được {"items":[…]}', async () => {
    const caller = recordingCaller((seen) => ({ text: asObject(idsOf(seen.user)), usage: null }))
    const result = await executeTranslateBatch({ caller, units, prompt: { outputMode: 'object' } })
    expect(caller.seen).toHaveLength(1)
    expect(caller.seen[0].responseFormat).toMatchObject({ type: 'json_schema' })
    expect(caller.seen[0].system).toContain('{"items":[…]}')
    expect(result.items).toHaveLength(3)
    expect(result.request?.outputMode).toBe('object')
  })

  it('schema bị từ chối (400 cấu hình) thì gửi lại đúng một lần không schema', async () => {
    const caller = recordingCaller((seen, index) => {
      if (index === 0) {
        throw new ProviderError('invalid_request', 'Invalid JSON schema', { status: 400 })
      }
      return {
        text: JSON.stringify(idsOf(seen.user).map((id) => ({ id, dst: 'x' }))),
        usage: null
      }
    })
    const budget = new CallBudget(1, 8)
    const result = await executeTranslateBatch({
      caller,
      units,
      prompt: { outputMode: 'object' },
      budget
    })
    expect(caller.seen).toHaveLength(2)
    expect(caller.seen[1].responseFormat).toBeUndefined()
    expect(caller.seen[1].system).not.toContain('"items"')
    expect(result.request?.outputMode).toBe('object→fallback')
    expect(result.error).toBeNull()
    expect(result.items).toHaveLength(3)
    // Lần gửi lại trừ vào ngân sách của lượt.
    expect(budget.snapshot().byRound.fallback).toBe(1)
  })

  it('lỗi khác (ví dụ refused) không rơi về', async () => {
    const caller = recordingCaller(() => {
      throw new ProviderError('refused', 'blocked', { status: 400 })
    })
    const result = await executeTranslateBatch({ caller, units, prompt: { outputMode: 'object' } })
    expect(caller.seen).toHaveLength(1)
    expect(result.error?.kind).toBe('refused')
  })

  it('bị bộ lọc chặn thì chia đôi giữ schema, không rơi về', async () => {
    const caller = recordingCaller((seen) =>
      idsOf(seen.user).length > 1 && seen.user.includes('"b"')
        ? { text: '', usage: null, finishReason: 'filter' }
        : seen.user.includes('"src":"b"')
          ? { text: '', usage: null, finishReason: 'filter' }
          : { text: asObject(idsOf(seen.user)), usage: null }
    )
    const result = await executeTranslateBatch({ caller, units, prompt: { outputMode: 'object' } })
    expect(caller.seen.length).toBeGreaterThan(1)
    expect(caller.seen.every((seen) => seen.responseFormat !== undefined)).toBe(true)
    expect(result.request?.outputMode).toBe('object')
    expect(result.refusedIds).toEqual(['u2'])
  })

  it('thiếu một id thì hỏi lại mang schema, và đếm lỗi cấu trúc', async () => {
    const caller = recordingCaller((seen, index) => {
      const ids = idsOf(seen.user)
      if (index === 0) {
        // Thiếu [3], lặp [1], thêm một id lạ.
        return {
          text: JSON.stringify({
            items: [
              { id: '[1]', dst: 'một' },
              { id: '[1]', dst: 'lặp' },
              { id: '[2]', dst: 'hai' },
              { id: '[9]', dst: 'lạ' }
            ]
          }),
          usage: null
        }
      }
      return { text: asObject(ids), usage: null }
    })
    const result = await executeTranslateBatch({ caller, units, prompt: { outputMode: 'object' } })
    expect(caller.seen).toHaveLength(2)
    expect(caller.seen[1].responseFormat).toBeDefined()
    expect(result.items.map((item) => item.id).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(result.structure).toEqual({ extraneous: 1, duplicate: 1, repaired: 1 })
  })
})
