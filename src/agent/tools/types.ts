/** Shared type definitions for the tool system. */

export interface AskUserOption {
  label: string
}

export interface AskUserQuestionItem {
  id: string
  question: string
  options?: AskUserOption[]
}

export interface AskUserAnswerItem {
  id: string
  selected: string[]
  custom?: string
}

export interface ExecutorContext {
  activeFile?: string | null
  /** Agent turn id; stamped onto undo entries so /undo can roll back a whole turn. */
  turnId?: string
  askUser?: (questions: AskUserQuestionItem[]) => Promise<AskUserAnswerItem[]>
  /** Live abort flag from the owning agent loop, propagated into sub agents. */
  abortSignal?: { aborted: boolean; signal?: AbortSignal }
}

export type ExecuteToolFn = (
  name: string,
  input: Record<string, unknown>,
  context?: ExecutorContext,
) => Promise<{ content: string; isError?: boolean }>
