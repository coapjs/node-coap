/// <reference types="node" />
import { EventEmitter } from 'events';
import { Socket } from 'dgram';
export default class RetrySend extends EventEmitter {
    _sock: Socket;
    _port: number;
    _host?: string;
    _maxRetransmit: number;
    _sendAttemp: number;
    _lastMessageId: number;
    _currentTime: number;
    _bOff: () => void;
    _message: Buffer;
    _timer: NodeJS.Timeout;
    _bOffTimer: NodeJS.Timeout;
    constructor(sock: any, port: number, host?: string, maxRetransmit?: number);
    _send(avoidBackoff?: boolean): void;
    send(message: Buffer, avoidBackoff?: boolean): void;
    reset(): void;
}
