/**
 * The `/sessions` built-in slash command — opens the session picker above the
 * input bar so the user can switch between saved chat sessions.
 * Pure helpers — no Svelte dependencies, so they are easy to unit test and can
 * be reused by any component that needs built-in command suggestions.
 */

/** The `/sessions` built-in command: show the session list and switch sessions. */
export const SESSIONS_COMMAND = '/sessions'
