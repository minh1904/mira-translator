import * as v from 'valibot'
import {
  qaDismissInputSchema,
  taskQualityInputSchema,
  type TaskQualityView
} from '../../../shared/contracts/taskQuality'
import {
  agentCancelInputSchema,
  agentContextSearchInputSchema,
  agentEditsInputSchema,
  agentRevertAndResendInputSchema,
  agentRevertInputSchema,
  agentSendInputSchema,
  agentSetPermissionLevelInputSchema,
  agentToolCallGetInputSchema,
  agentUndoInputSchema,
  agentWriteIntentAckSchema,
  type AgentCancelResult,
  type AgentContextSearchGroup,
  type AgentEditsResult,
  type AgentOperation,
  type AgentOperationDetailView,
  type AgentRevertResult,
  type AgentSendInput,
  type AgentSendResult,
  type AgentSessionDetailView,
  type AgentSessionView,
  type AgentToolCallDetailView,
  type AgentUndoResult
} from '../../../shared/contracts/agent'
import { CHANNELS, EVENT_CHANNELS } from '../../../shared/contracts/channels'
import { idSchema } from '../../../shared/contracts/library'
import { StorageError } from '../../infra/storage/errors'
import type { ChangedText } from '../../services/agent/agentService'
import { createHandler, createSinkHandler, sinkBroadcast } from '../handler'
import { agentOf, tasksOf, type AreaHandlers, type HandlerDeps } from './deps'
import {
  agentTaskControlInputSchema,
  agentTaskCreateInputSchema,
  agentTaskGetInputSchema,
  agentTaskSteerInputSchema,
  type AgentTaskSteerResult,
  agentTaskListInputSchema,
  type AgentTaskDetailView,
  type AgentTaskSummary,
  type AgentTaskView
} from '../../../shared/contracts/agentTask'

const sessionsListSchema = v.nullable(
  v.strictObject({
    limit: v.optional(v.number())
  })
)

const sessionGetSchema = v.strictObject({
  sessionId: idSchema
})

const sessionCreateSchema = v.nullable(
  v.strictObject({
    title: v.optional(v.string())
  })
)

const operationGetSchema = v.strictObject({
  operationId: idSchema
})

const operationListSchema = v.strictObject({
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500))
})

type Sink = Parameters<typeof sinkBroadcast>[0]

export function agentHandlers(deps: HandlerDeps): AreaHandlers<'agent'> {
  /** Accepts a turn and runs it in Main: closing the window that sent it does not cancel it (D8). */
  const startTurn = (input: AgentSendInput, sink: Sink): AgentSendResult => {
    const agent = agentOf(deps)
    const accepted = agent.acceptTurn(input)
    if (accepted.created) {
      const windows = deps.windows ?? sinkBroadcast(sink)
      setImmediate(() => {
        void agent
          .runExistingTurn({
            sessionId: accepted.sessionId,
            turnId: accepted.turnId,
            requestId: accepted.requestId,
            commandId: input.clientCommandId,
            instruction: input.instruction,
            context: input.context,
            modelSelection: input.modelSelection,
            onStream: (event) => windows.send(EVENT_CHANNELS.agentStreamEvent, event),
            onWriteIntent: (intent) => windows.send(EVENT_CHANNELS.agentTargetWriteIntent, intent),
            onTargetChanged: (event) => windows.send(EVENT_CHANNELS.agentTargetChanged, event)
          })
          .catch((error: unknown) => {
            console.error(
              'Agent runtime failed:',
              error instanceof Error ? error.message : 'unknown'
            )
          })
      })
    }
    return {
      requestId: accepted.requestId,
      turnId: accepted.turnId,
      sessionId: accepted.sessionId
    }
  }

  /** Open editors reload the chapter texts an undo rewrote. */
  const announce = (changed: ChangedText[], sink: Sink): void => {
    const windows = deps.windows ?? sinkBroadcast(sink)
    for (const text of changed) {
      windows.send(EVENT_CHANNELS.agentTargetChanged, {
        target: { workId: text.workId, chapterId: text.chapterId, side: text.side },
        lastAppliedRev: text.rev,
        operationId: text.operationId
      })
    }
  }

  return {
    [CHANNELS.agentSessionsList]: createHandler(
      sessionsListSchema,
      (input): { sessions: AgentSessionView[] } => {
        const agent = agentOf(deps)
        const sessions = agent.listSessions()
        const limited = input?.limit ? sessions.slice(0, input.limit) : sessions
        return { sessions: limited }
      }
    ),

    [CHANNELS.agentSessionsGet]: createHandler(
      sessionGetSchema,
      ({ sessionId }): AgentSessionDetailView => agentOf(deps).getSessionDetail(sessionId)
    ),

    [CHANNELS.agentSessionsCreate]: createHandler(
      sessionCreateSchema,
      (input): AgentSessionView => {
        return agentOf(deps).createSession(input?.title)
      }
    ),

    [CHANNELS.agentSessionsSetPermissionLevel]: createHandler(
      agentSetPermissionLevelInputSchema,
      ({ sessionId, level }): AgentSessionView => agentOf(deps).setPermissionLevel(sessionId, level)
    ),

    [CHANNELS.agentTurnSend]: createSinkHandler(
      agentSendInputSchema,
      (input, sink): AgentSendResult => startTurn(input, sink)
    ),

    [CHANNELS.agentTurnRevert]: createSinkHandler(
      agentRevertInputSchema,
      ({ turnId }, sink): AgentRevertResult => {
        const { changed, ...result } = agentOf(deps).revertToTurn(turnId)
        announce(changed, sink)
        return result
      }
    ),

    [CHANNELS.agentTurnRevertAndResend]: createSinkHandler(
      agentRevertAndResendInputSchema,
      ({ turnId, ...command }, sink): AgentSendResult => {
        const agent = agentOf(deps)
        const sessionId = agent.getTurn(turnId)?.sessionId
        if (!sessionId) throw new StorageError('not_found', 'Không tìm thấy lượt agent.')
        // A refused restore throws here, so nothing is sent.
        const { changed } = agent.revertToTurn(turnId)
        announce(changed, sink)
        return startTurn({ ...command, sessionId }, sink)
      }
    ),

    [CHANNELS.agentEditsKeep]: createHandler(
      agentEditsInputSchema,
      ({ sessionId, chapter }): AgentEditsResult => agentOf(deps).keepEdits(sessionId, chapter)
    ),

    [CHANNELS.agentEditsUndo]: createSinkHandler(
      agentEditsInputSchema,
      ({ sessionId, chapter }, sink): AgentEditsResult => {
        const { changed, ...result } = agentOf(deps).undoEdits(sessionId, chapter)
        announce(changed, sink)
        return result
      }
    ),

    [CHANNELS.agentToolCallGet]: createHandler(
      agentToolCallGetInputSchema,
      ({ toolCallId }): AgentToolCallDetailView => agentOf(deps).getToolCallDetail(toolCallId)
    ),

    [CHANNELS.agentContextSearch]: createHandler(
      agentContextSearchInputSchema,
      (input): AgentContextSearchGroup[] => agentOf(deps).searchContext(input)
    ),

    [CHANNELS.agentTurnCancel]: createHandler(
      agentCancelInputSchema,
      ({ turnId }): AgentCancelResult => ({ status: agentOf(deps).cancelTurn(turnId) })
    ),

    [CHANNELS.agentOperationList]: createHandler(
      operationListSchema,
      ({ limit }): AgentOperation[] => agentOf(deps).listRecentOperations(limit)
    ),

    [CHANNELS.agentOperationGet]: createHandler(
      operationGetSchema,
      ({ operationId }): AgentOperationDetailView => {
        const op = agentOf(deps).getOperation(operationId)
        if (!op) {
          throw new StorageError('not_found', 'Không tìm thấy operation.')
        }
        return { operation: op }
      }
    ),

    [CHANNELS.agentOperationUndo]: createSinkHandler(
      agentUndoInputSchema,
      ({ operationId }, sink): AgentUndoResult => {
        const agent = agentOf(deps)
        const undone = agent.undoOperation(operationId)
        if (undone.target.kind === 'chapter') {
          ;(deps.windows ?? sinkBroadcast(sink)).send(EVENT_CHANNELS.agentTargetChanged, {
            target: {
              workId: undone.target.workId,
              chapterId: undone.target.chapterId,
              side: 'target'
            },
            lastAppliedRev: undone.targetRev,
            operationId
          })
        }
        return { targetRev: undone.targetRev }
      }
    ),

    [CHANNELS.agentTaskList]: createHandler(
      agentTaskListInputSchema,
      (input): { tasks: AgentTaskSummary[] } => ({
        tasks: tasksOf(deps).list(input?.workId ? { workId: input.workId } : {})
      })
    ),

    [CHANNELS.agentTaskGet]: createHandler(
      agentTaskGetInputSchema,
      ({ taskId }): AgentTaskDetailView => tasksOf(deps).get(taskId)
    ),

    [CHANNELS.agentTaskCreate]: createHandler(
      agentTaskCreateInputSchema,
      (input): AgentTaskView => tasksOf(deps).create(input).task
    ),

    [CHANNELS.agentTaskControl]: createHandler(
      agentTaskControlInputSchema,
      (input): AgentTaskView => tasksOf(deps).control(input)
    ),

    [CHANNELS.agentTaskQuality]: createHandler(
      taskQualityInputSchema,
      ({ taskId }): TaskQualityView => tasksOf(deps).quality(taskId)
    ),

    [CHANNELS.agentTaskDismiss]: createHandler(qaDismissInputSchema, (input): void => {
      tasksOf(deps).dismiss(input)
    }),

    [CHANNELS.agentTaskSteer]: createHandler(
      agentTaskSteerInputSchema,
      (input): AgentTaskSteerResult => tasksOf(deps).steer(input)
    ),

    [CHANNELS.agentTargetWriteAck]: createSinkHandler(
      agentWriteIntentAckSchema,
      (input, sink): void => {
        agentOf(deps).acknowledgeWriteIntent(input, sink.senderId)
      }
    )
  }
}
