## API Report File for "@remirror/react-hooks"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { EffectCallback } from 'react';
import { SetStateAction } from 'react';
import { useEffect } from 'react';

// @public (undocumented)
export type DispatchWithCallback<GValue> = (value: GValue, callback?: () => void) => void;

// @public (undocumented)
export interface DOMRectReadOnlyLike {
    // (undocumented)
    readonly bottom: number;
    // (undocumented)
    readonly height: number;
    // (undocumented)
    readonly left: number;
    // (undocumented)
    readonly right: number;
    // (undocumented)
    readonly top: number;
    // (undocumented)
    readonly width: number;
    // (undocumented)
    readonly x: number;
    // (undocumented)
    readonly y: number;
}

// @public (undocumented)
export type PartialSetStateAction<GState> = Partial<GState> | ((prevState: GState) => Partial<GState>);

// @public
export const useEffectOnce: (effect: EffectCallback) => void;

// @public
export const useEffectOnUpdate: typeof useEffect;

// @public
export const useMeasure: <GRef extends HTMLElement = any>() => readonly [{
    readonly ref: import("react").RefObject<GRef>;
}, DOMRectReadOnlyLike];

// @public
export const usePrevious: <GValue>(value: GValue) => GValue | undefined;

// @public
export const useSetState: <GState extends object>(initialState?: GState | (() => GState)) => readonly [GState, DispatchWithCallback<PartialSetStateAction<GState>>, (callback?: (() => void) | undefined) => void];

// Warning: (ae-forgotten-export) The symbol "UseStateWithCallback" needs to be exported by the entry point index.d.ts
// 
// @public
export const useStateWithCallback: UseStateWithCallback;

// @public
export const useTimeouts: () => readonly [(fn: () => void, time?: number) => void, () => void];

// @public
export const useUnmount: (fn: () => void | undefined) => void;


// (No @packageDocumentation comment for this package)

```