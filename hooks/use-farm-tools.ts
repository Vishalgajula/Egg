import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: Tool,
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};

/** Optional agent interface; unsupported browsers retain the complete visible UI. */
export function useFarmTools(summary: object, startRecord: () => void) {
  const current = useRef({ summary, startRecord });
  useEffect(() => {
    current.current = { summary, startRecord };
  });
  useEffect(() => {
    const context = (document as ModelDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const checkEmpty = (input: unknown) => {
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        throw new Error('Expected an empty object.');
    };
    const tools: Tool[] = [
      {
        name: 'get_farm_summary',
        description:
          'Read the current farm inventory and selected reporting period totals.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          checkEmpty(input);
          return current.current.summary;
        },
      },
      {
        name: 'start_daily_record',
        description:
          'Open the daily record form. Does not save a record; the owner completes the visible form.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          checkEmpty(input);
          flushSync(() => current.current.startRecord());
          return { status: 'form_open', saved: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {
          /* Optional API; UI remains available. */
        });
      } catch {
        /* Optional API; UI remains available. */
      }
    }
    return () => lifecycle.abort();
  }, []);
}
