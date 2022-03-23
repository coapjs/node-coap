import { Parameters, ParametersUpdate } from '../models/models';
declare const p: Parameters;
declare function refreshTiming(values?: ParametersUpdate): void;
declare function defaultTiming(): void;
export { p as parameters, refreshTiming, defaultTiming };
