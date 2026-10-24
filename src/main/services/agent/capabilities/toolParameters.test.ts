import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { AGENT_WRITE_TOOLS } from '../../../../shared/contracts/agentEmptyTurn'
import type { ConnectionService } from '../../ai/connectionService'
import type { CapabilityDefinition } from '../types'
import {
  answerContextQuestionsCapability,
  readContextQuestionsCapability,
  setWorkConventionsCapability
} from './contextQuestionCapabilities'
import { defaultReadCapabilities, getWorkOverviewCapability } from './readCapabilities'
import { createWriteCapabilities, updateWorkCapability } from './writeCapabilities'
import {
  createTranslationTaskCapability,
  readAiCallLogCapability,
  readTaskQualityCapability,
  readTaskRunsCapability,
  readTranslationTasksCapability,
  steerTranslationTaskCapability
} from './taskCapabilities'

const write = createWriteCapabilities({ connections: {} as ConnectionService })
const chatCapabilities: CapabilityDefinition[] = [
  readContextQuestionsCapability,
  answerContextQuestionsCapability,
  setWorkConventionsCapability,
  ...defaultReadCapabilities,
  write.translateChapterCapability,
  write.editTranslationCapability,
  write.undoOperationCapability,
  updateWorkCapability,
  createTranslationTaskCapability,
  steerTranslationTaskCapability,
  readTranslationTasksCapability({ list: () => [], get: () => ({}) as never }),
  readTaskQualityCapability({ list: () => [], quality: () => ({}) as never }),
  readTaskRunsCapability({ list: () => [], get: () => ({}) as never, runs: () => ({}) as never }),
  readAiCallLogCapability,
  getWorkOverviewCapability()
]

/** A valid and an invalid model payload per capability, both without `target`. */
const samples: Record<string, { valid: unknown; invalid: unknown }> = {
  ask_questions: {
    valid: {
      questions: [
        { id: 'style', title: 'Phong cách?', type: 'single', options: ['Thuần Việt', 'Convert'] }
      ]
    },
    invalid: { questions: [{ id: 'style', title: 'Phong cách?', type: 'single', options: ['A'] }] }
  },
  run_subagent: {
    valid: { task: 'Tìm kiếm nhân vật', description: 'Tìm kiếm nhân vật' },
    invalid: { task: '', description: '' }
  },
  list_works: { valid: {}, invalid: null },
  list_chapters: { valid: {}, invalid: null },
  read_chapter: { valid: { side: 'source', offset: 20000 }, invalid: { offset: -1 } },
  read_segments: { valid: { side: 'target' }, invalid: {} },
  search_work: { valid: { query: 'Lâm' }, invalid: { query: '' } },
  list_glossary: { valid: {}, invalid: null },
  list_addressing: { valid: {}, invalid: null },
  read_context_questions: { valid: {}, invalid: null },
  answer_context_questions: {
    valid: { answers: [{ questionId: 'q1', label: 'Nam' }] },
    invalid: { answers: [] }
  },
  set_work_conventions: { valid: { honorifics: 'keep' }, invalid: { honorifics: 'drop' } },
  translate_chapter: { valid: {}, invalid: { connectionId: 1 } },
  edit_translation: {
    valid: { replacements: [{ sourceId: 's1', text: 'Xin chào' }], expectedRev: 3 },
    invalid: { replacements: [] }
  },
  undo_operation: { valid: { operationId: 'op' }, invalid: {} },
  update_work: {
    valid: {
      work: { title: 'Sword Coming', author: null, status: 'in-progress' },
      chapters: [{ number: 1, title: 'The Beginning' }]
    },
    invalid: { chapters: [{ number: 1, title: '' }] }
  },
  create_translation_task: {
    valid: { fromChapter: 1, toChapter: 30 },
    invalid: { fromChapter: 1, toChapter: 30, contextStrategy: 'guess' }
  },
  steer_translation_task: {
    valid: { taskId: 't', fromChapter: 8, instruction: 'Giữ câu ngắn.' },
    invalid: { taskId: 't', fromChapter: 8, instruction: '' }
  },
  read_translation_tasks: { valid: {}, invalid: null },
  read_task_quality: {
    valid: { rule: 'text.unbalanced_quotes', offset: 30, limit: 100 },
    invalid: { limit: 101 }
  },
  read_task_runs: { valid: {}, invalid: null },
  read_ai_call_log: {
    valid: { kind: 'translate', offset: 3, withMessages: true },
    invalid: { kind: '' }
  },
  get_work_overview: { valid: {}, invalid: null },
  todo_list: {
    valid: { todos: [{ content: 'Dịch chương 1', status: 'in_progress' }] },
    invalid: { todos: [{ content: 'Dịch chương 1', status: 'done' }] }
  }
}

type Entries = Record<string, { type: string }>

describe('chat tool parameters', () => {
  it('lists every capability that is not a read as a write tool for the empty-turn rule', () => {
    const writes = chatCapabilities.filter((cap) => cap.kind !== 'read').map((cap) => cap.name)
    expect([...AGENT_WRITE_TOOLS].sort()).toEqual(writes.sort())
  })

  it('declares hand-written parameters for every chat capability', () => {
    expect(chatCapabilities.filter((cap) => !cap.parameters).map((cap) => cap.name)).toEqual([])
    expect(Object.keys(samples).sort()).toEqual(chatCapabilities.map((cap) => cap.name).sort())
  })

  it.each(chatCapabilities.map((cap) => [cap.name, cap] as const))(
    '%s parameters match its valibot schema',
    (_name, cap) => {
      const parameters = cap.parameters!
      const entries = (cap.schema as unknown as { entries: Entries }).entries
      const exposed = Object.keys(parameters.properties).filter((key) => key !== 'target')
      // Every exposed argument is one the schema knows; translate_chapter hides the model fields.
      for (const key of exposed) expect(Object.keys(entries)).toContain(key)
      const required = parameters.required.filter((key) => key !== 'target')
      const schemaRequired = Object.entries(entries)
        .filter(([, entry]) => entry.type !== 'optional')
        .map(([key]) => key)
      expect(required.sort()).toEqual(schemaRequired.sort())
      for (const key of parameters.required) expect(parameters.properties).toHaveProperty(key)

      const wantsTarget = cap.targetPolicy !== 'no_target' && cap.name !== 'undo_operation'
      expect('target' in parameters.properties).toBe(wantsTarget)

      const sample = samples[cap.name]
      expect(v.safeParse(cap.schema, sample.valid).success).toBe(true)
      expect(v.safeParse(cap.schema, sample.invalid).success).toBe(false)
    }
  )
})
