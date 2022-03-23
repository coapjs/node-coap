import { MiddlewareParameters } from '../models/models';
declare type middlewareCallback = (nullOrError: null | Error) => void;
export declare function parseRequest(request: MiddlewareParameters, next: middlewareCallback): void;
export declare function handleServerRequest(request: MiddlewareParameters, next: middlewareCallback): void;
export declare function proxyRequest(request: MiddlewareParameters, next: middlewareCallback): void;
export declare function handleProxyResponse(request: MiddlewareParameters, next: middlewareCallback): void;
export {};
