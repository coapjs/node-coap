/// <reference types="node" />
import BufferList from 'bl';
import { CoapPacket, CoapRequestParams, OptionValue } from '../models/models';
import RetrySend from './retry_send';
import { SegmentedTransmission } from './segmentation';
import IncomingMessage from './incoming_message';
import { OptionName, Packet } from 'coap-packet';
export default class OutgoingMessage extends BufferList implements BufferList {
    _packet: Packet;
    _ackTimer: NodeJS.Timeout | null;
    _send: (req: OutgoingMessage, packet: Packet) => void;
    statusCode: string;
    code: string;
    multicast: boolean;
    _request: CoapPacket;
    url: CoapRequestParams;
    sender: RetrySend;
    _totalPayload: Buffer;
    multicastTimer: NodeJS.Timeout;
    segmentedSender?: SegmentedTransmission;
    response: IncomingMessage;
    constructor(request: CoapPacket, send: (req: OutgoingMessage, packet: CoapPacket) => void);
    end(a?: any, b?: any): this;
    reset(): this;
    /**
     * @param {OptionName | number} code
     * @param {Partial<Record<OptionName, OptionValue>>} headers
     */
    writeHead(code: OptionName | number, headers: Partial<Record<OptionName, OptionValue>>): void;
    setOption(name: OptionName | string, values: OptionValue): this;
    setHeader(name: OptionName, values: OptionValue): this;
}
