/* tslint:disable */
/* eslint-disable */
export class EventStreamer {
  free(): void;
  constructor();
  /**
   * @param {Uint8Array} deflated
   * @returns {string}
   */
  process(deflated: Uint8Array): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_eventstreamer_free: (a: number, b: number) => void;
  readonly eventstreamer_new: () => number;
  readonly zlibVersion: () => number;
  readonly inflateInit2_: (a: number, b: number, c: number, d: number) => number;
  readonly eventstreamer_process: (a: number, b: number, c: number) => Array;
  readonly inflate: (a: number, b: number) => number;
  readonly inflateEnd: (a: number) => number;
  readonly crc32: (a: number, b: number, c: number) => number;
  readonly crc32_combine: (a: number, b: number, c: number) => number;
  readonly adler32: (a: number, b: number, c: number) => number;
  readonly adler32_combine: (a: number, b: number, c: number) => number;
  readonly uncompress: (a: number, b: number, c: number, d: number) => number;
  readonly inflateBackInit_: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly inflateBack: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly inflateBackEnd: (a: number) => number;
  readonly inflateCopy: (a: number, b: number) => number;
  readonly inflateMark: (a: number) => number;
  readonly inflateSync: (a: number) => number;
  readonly inflateSyncPoint: (a: number) => number;
  readonly inflateInit_: (a: number, b: number, c: number) => number;
  readonly inflatePrime: (a: number, b: number, c: number) => number;
  readonly inflateReset: (a: number) => number;
  readonly inflateReset2: (a: number, b: number) => number;
  readonly inflateSetDictionary: (a: number, b: number, c: number) => number;
  readonly inflateGetHeader: (a: number, b: number) => number;
  readonly inflateUndermine: (a: number, b: number) => number;
  readonly inflateResetKeep: (a: number) => number;
  readonly inflateCodesUsed: (a: number) => number;
  readonly deflate: (a: number, b: number) => number;
  readonly deflateSetHeader: (a: number, b: number) => number;
  readonly deflateBound: (a: number, b: number) => number;
  readonly compress: (a: number, b: number, c: number, d: number) => number;
  readonly compress2: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly compressBound: (a: number) => number;
  readonly deflateEnd: (a: number) => number;
  readonly deflateReset: (a: number) => number;
  readonly deflateParams: (a: number, b: number, c: number) => number;
  readonly deflateSetDictionary: (a: number, b: number, c: number) => number;
  readonly deflatePrime: (a: number, b: number, c: number) => number;
  readonly deflatePending: (a: number, b: number, c: number) => number;
  readonly deflateCopy: (a: number, b: number) => number;
  readonly deflateInit_: (a: number, b: number, c: number, d: number) => number;
  readonly deflateInit2_: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
  readonly deflateTune: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly zError: (a: number) => number;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
