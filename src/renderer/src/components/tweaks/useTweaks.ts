import { useCallback, useState } from "react";

export type SetTweak<T extends Record<string, unknown>> = {
  <K extends keyof T>(key: K, value: T[K]): void;
  (edits: Partial<T>): void;
};

export function useTweaks<T extends Record<string, unknown>>(defaults: T): readonly [T, SetTweak<T>] {
  const [values, setValues] = useState<T>(defaults);

  const setTweak = useCallback<SetTweak<T>>((keyOrEdits: keyof T | Partial<T>, value?: T[keyof T]) => {
    const edits =
      typeof keyOrEdits === "object" && keyOrEdits !== null ? keyOrEdits : ({ [keyOrEdits]: value } as Partial<T>);
    setValues((prev) => ({ ...prev, ...edits }));
  }, []);

  return [values, setTweak] as const;
}
