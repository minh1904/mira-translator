import * as v from 'valibot'
import {
  WORK_CONVENTIONS,
  type WorkConventionKey
} from '../../../../shared/contracts/contextQuestions'
import { ContextQuestionService } from '../../context/contextQuestionService'
import type { CapabilityDefinition } from '../types'
import { TARGET_PARAM } from './readCapabilities'

const TARGET_NEEDED = 'Cần handle của tác phẩm (target).'

/** Open questions `read_context_questions` returns at most. */
const QUESTIONS_PAGE = 20

/**
 * Chat side of context questions (change `add-context-questions`): read the open ones, most impact
 * first, to ask the user with `ask_questions`; then apply the labels the user chose.
 */
export const readContextQuestionsCapability: CapabilityDefinition<Record<string, never>> = {
  name: 'read_context_questions',
  description:
    'Đọc các câu hỏi ngữ cảnh đang mở của tác phẩm (chỗ bước trích chưa chắc: sửa đổi bị giữ lại, hai mục ' +
    'có thể là một, giới tính chưa chắc), xếp theo mức ảnh hưởng giảm dần, tối đa 20 câu. Mặc định của mỗi câu ' +
    'đã được áp. Muốn hỏi người dùng thì dùng ask_questions với tối đa 5 câu, giữ nguyên id và nhãn lựa chọn.',
  kind: 'read',
  schema: v.object({}),
  parameters: { type: 'object', properties: { target: TARGET_PARAM }, required: ['target'] },
  targetPolicy: 'requires_target',
  handler: async ({ library, target }) => {
    if (!target) return { ok: false, error: { code: 'validation', message: TARGET_NEEDED } }
    const numbers = new Map(library.listChapters(target.workId).map((c) => [c.id, c.number]))
    const questions = new ContextQuestionService(library).list(target.workId)
    return {
      ok: true,
      value: {
        total: questions.length,
        questions: questions.slice(0, QUESTIONS_PAGE).map((question) => ({
          id: question.id,
          entry: question.entrySource,
          title: question.title,
          options: question.options,
          default: question.default,
          impact: question.impact,
          evidence: question.evidence.map((quote) => ({
            chapter: quote.chapterId ? (numbers.get(quote.chapterId) ?? null) : null,
            quote: quote.quote
          }))
        }))
      }
    }
  },
  describe: ({ target }) => `Đọc câu hỏi ngữ cảnh của "${target?.workLabel ?? 'tác phẩm'}"`
}

export const answerContextQuestionsCapability: CapabilityDefinition<{
  answers: Array<{ questionId: string; label: string }>
}> = {
  name: 'answer_context_questions',
  description:
    'Áp đáp án người dùng đã chọn cho câu hỏi ngữ cảnh: mỗi cặp id câu hỏi → nhãn lựa chọn đúng như ' +
    'read_context_questions trả. Chỉ gọi với đáp án người dùng chọn trong ask_questions của lượt này; khi ' +
    'ask_questions được tự trả lời bằng mặc định (Autopilot) thì không gọi, vì mặc định đã được áp. Kết quả ' +
    'từng câu riêng: câu đã đóng hay nhãn sai không chặn các câu khác.',
  kind: 'reversible-write',
  schema: v.object({
    answers: v.pipe(
      v.array(
        v.object({
          questionId: v.pipe(v.string(), v.minLength(1)),
          label: v.pipe(v.string(), v.trim(), v.minLength(1))
        })
      ),
      v.minLength(1),
      v.maxLength(QUESTIONS_PAGE)
    )
  }),
  parameters: {
    type: 'object',
    properties: {
      target: TARGET_PARAM,
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: { questionId: { type: 'string' }, label: { type: 'string' } },
          required: ['questionId', 'label']
        }
      }
    },
    required: ['target', 'answers']
  },
  targetPolicy: 'requires_target',
  handler: async ({ library, target, args }) => {
    if (!target) return { ok: false, error: { code: 'validation', message: TARGET_NEEDED } }
    const service = new ContextQuestionService(library)
    const results = args.answers.map(({ questionId, label }) => {
      try {
        const applied = service.answer(target.workId, questionId, label)
        return { questionId, ok: true, ...applied }
      } catch (error) {
        return {
          questionId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })
    return { ok: true, value: { results } }
  },
  describe: ({ args }) => `Áp ${args.answers.length} đáp án câu hỏi ngữ cảnh`
}

const conventionValue = (key: WorkConventionKey) =>
  v.optional(v.picklist(WORK_CONVENTIONS[key] as unknown as [string, ...string[]]))

export const setWorkConventionsCapability: CapabilityDefinition<
  Partial<Record<WorkConventionKey, string>>
> = {
  name: 'set_work_conventions',
  description:
    'Lưu quy ước dịch của tác phẩm mà người dùng vừa chọn trong ask_questions, và đánh dấu là đã chốt: ' +
    'ja_romanization (hepburn_macron: Ryōta, hepburn_plain: Ryota, wapuro: Ryouta; chỉ cho truyện tiếng ' +
    'Nhật), honorifics (keep: giữ -san, vietnamize: Việt hóa), correction_retranslate (list: chỉ liệt kê ' +
    'chương bị ảnh hưởng, ask: hỏi có dịch lại không). Người dùng bỏ qua câu hỏi thì lưu giá trị mặc định. ' +
    'ask_questions trả autoAnswered thì không gọi.',
  kind: 'reversible-write',
  schema: v.object({
    ja_romanization: conventionValue('ja_romanization'),
    honorifics: conventionValue('honorifics'),
    correction_retranslate: conventionValue('correction_retranslate')
  }),
  parameters: {
    type: 'object',
    properties: {
      target: TARGET_PARAM,
      ...Object.fromEntries(
        (Object.keys(WORK_CONVENTIONS) as WorkConventionKey[]).map((key) => [
          key,
          { type: 'string', enum: [...WORK_CONVENTIONS[key]] }
        ])
      )
    },
    required: ['target']
  },
  targetPolicy: 'requires_target',
  handler: async ({ library, target, args }) => {
    if (!target) return { ok: false, error: { code: 'validation', message: TARGET_NEEDED } }
    const service = new ContextQuestionService(library)
    let renamed = 0
    for (const key of Object.keys(WORK_CONVENTIONS) as WorkConventionKey[]) {
      const value = args[key]
      if (value === undefined) continue
      renamed += service.setConvention(target.workId, key, value).renamed
    }
    return { ok: true, value: { conventions: service.conventions(target.workId), renamed } }
  },
  describe: () => 'Lưu quy ước dịch của tác phẩm'
}
