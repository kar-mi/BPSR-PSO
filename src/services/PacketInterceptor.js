import cap from 'cap';
import zlib from 'zlib';
import logger from './Logger.js';
import userDataManager from './UserDataManager.js';

import { PacketProcessor } from './PacketProcessor.js';
import { Lock } from '../models/Lock.js';
import { Readable } from 'stream';
import { findDefaultNetworkDevice } from './NetInterfaceService.js';

const Cap = cap.Cap;
const decoders = cap.decoders;
const PROTOCOL = decoders.PROTOCOL;

const clearDataOnServerChange = () => {
    userDataManager.refreshEnemyCache();
    if (
        !globalSettings.autoClearOnServerChange ||
        userDataManager.lastLogTime === 0 ||
        userDataManager.users.size === 0
    ) {
        return;
    }
    userDataManager.clearAll();
    logger.info('Server changed, statistics cleared!');
};

export class PacketInterceptor {
    static isRunning = true;
    static cleanupInterval = null;

    static stop() {
        this.isRunning = false;
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    static start(server, port, resolve, reject) {
        this.isRunning = true;
        server.listen(port, async () => {
            const devices = cap.deviceList();
            let num;

            console.log('Auto detecting default network interface...');
            const device_num = await findDefaultNetworkDevice(devices);
            if (device_num !== null && device_num !== undefined) {
                num = device_num;
                console.log(`Using network interface: ${num} - ${devices[num].description}`);
            } else {
                return reject(new Error('Default network interface not found!'));
            }

            if (!zlib.zstdDecompressSync) {
                const errorMsg = 'zstdDecompressSync is not available! Please update your Node.js!';
                logger.error(errorMsg);
                return reject(new Error(errorMsg));
            }

            const url = `http://localhost:${port}`;
            logger.info(`Web Server started at ${url}`);
            logger.info('WebSocket Server started');

            logger.info('Welcome!');
            logger.info('Attempting to find the game server, please wait!');

            let current_server = '';
            let _data = Buffer.alloc(0);
            let tcp_next_seq = -1;
            let tcp_cache = new Map();
            let tcp_last_time = 0;
            const tcp_lock = new Lock();
            const TCP_CACHE_MAX_SIZE = 1000; // 1GB - Maximum number of out-of-order packets to cache

            const clearTcpCache = () => {
                _data = Buffer.alloc(0);
                tcp_next_seq = -1;
                tcp_last_time = 0;
                tcp_cache.clear();
            };

            const fragmentIpCache = new Map();
            const FRAGMENT_TIMEOUT = 30000;
            const getTCPPacket = (frameBuffer, ethOffset) => {
                const ipPacket = decoders.IPV4(frameBuffer, ethOffset);
                const ipId = ipPacket.info.id;
                const isFragment = (ipPacket.info.flags & 0x1) !== 0;
                const _key = `${ipId}-${ipPacket.info.srcaddr}-${ipPacket.info.dstaddr}-${ipPacket.info.protocol}`;
                const now = Date.now();

                if (isFragment || ipPacket.info.fragoffset > 0) {
                    if (!fragmentIpCache.has(_key)) {
                        fragmentIpCache.set(_key, { fragments: [], timestamp: now });
                    }
                    const cacheEntry = fragmentIpCache.get(_key);
                    cacheEntry.fragments.push(Buffer.from(frameBuffer.subarray(ethOffset)));
                    cacheEntry.timestamp = now;

                    if (isFragment) return null;

                    const { fragments } = cacheEntry;
                    if (!fragments) {
                        logger.error(`Can't find fragments for ${_key}`);
                        return null;
                    }

                    let totalLength = 0;
                    const fragmentData = [];
                    for (const buffer of fragments) {
                        const ip = decoders.IPV4(buffer);
                        const fragmentOffset = ip.info.fragoffset * 8;
                        const payloadLength = ip.info.totallen - ip.hdrlen;
                        const payload = Buffer.from(buffer.subarray(ip.offset, ip.offset + payloadLength));
                        fragmentData.push({ offset: fragmentOffset, payload });
                        const endOffset = fragmentOffset + payloadLength;
                        if (endOffset > totalLength) totalLength = endOffset;
                    }

                    const fullPayload = Buffer.alloc(totalLength);
                    for (const fragment of fragmentData) {
                        fragment.payload.copy(fullPayload, fragment.offset);
                    }
                    fragmentIpCache.delete(_key);
                    return fullPayload;
                }
                return Buffer.from(
                    frameBuffer.subarray(ipPacket.offset, ipPacket.offset + (ipPacket.info.totallen - ipPacket.hdrlen))
                );
            };

            const c = new Cap();
            const device = devices[num].name;
            const filter = 'ip and tcp';
            const bufSize = 10 * 1024 * 1024;
            const buffer = Buffer.alloc(65535);
            const linkType = c.open(device, filter, bufSize, buffer);
            if (linkType !== 'ETHERNET') {
                logger.error('The device seems to be WRONG! Please check the device! Device type: ' + linkType);
            }
            c.setMinBytes && c.setMinBytes(0);

            const eth_queue = [];
            c.on('packet', (nbytes) => {
                eth_queue.push(Buffer.from(buffer.subarray(0, nbytes)));
            });

            const processEthPacket = async (frameBuffer) => {
                let ethPacket;
                if (linkType === 'ETHERNET') {
                    ethPacket = decoders.Ethernet(frameBuffer);
                
                // possible vpn/non ethernet fixes
                } else if (linkType === 'NULL') {
                    ethPacket = {
                        info: {
                            dstmac: '44:69:6d:6f:6c:65',
                            srcmac: '44:69:6d:6f:6c:65',
                            type: frameBuffer.readUInt32LE() === 2 ? 2048 : 75219598273637n,
                            vlan: undefined,
                            length: undefined,
                        },
                        offset: 4,
                    };

                } else if (linkType === 'LINKTYPE_LINUX_SLL') {
                    ethPacket = {
                        info: {
                            dstmac: '44:69:6d:6f:6c:65',
                            srcmac: '44:69:6d:6f:6c:65',
                            type: frameBuffer.readUInt32BE(14) === 0x0800 ? 2048 : 75219598273637n,
                            vlan: undefined,
                            length: undefined,
                        },
                        offset: 16,
                    };
                }
                if (ethPacket.info.type !== PROTOCOL.ETHERNET.IPV4) return;

                const ipPacket = decoders.IPV4(frameBuffer, ethPacket.offset);
                const { srcaddr, dstaddr } = ipPacket.info;

                const tcpBuffer = getTCPPacket(frameBuffer, ethPacket.offset);
                if (tcpBuffer === null) return;

                const tcpPacket = decoders.TCP(tcpBuffer);
                const buf = Buffer.from(tcpBuffer.subarray(tcpPacket.hdrlen));
                const { srcport, dstport } = tcpPacket.info;
                const src_server = `${srcaddr}:${srcport} -> ${dstaddr}:${dstport}`;
                const src_server_re = `${dstaddr}:${dstport} -> ${srcaddr}:${srcport}`;

                // Skip empty TCP packets (e.g., FIN, RST, ACK without data)
                if (buf.length === 0) {
                    return;
                }

                await tcp_lock.acquire();
                try {
                    if (current_server !== src_server && current_server !== src_server_re) {
                        try {
                            if (buf.length > 4 && buf[4] == 0) {
                                const data = buf.subarray(10);
                                if (data.length) {
                                    const stream = Readable.from(data, { objectMode: false });
                                    let data1;
                                    do {
                                        const len_buf = stream.read(4);
                                        if (!len_buf) break;

                                        const packetLength = len_buf.readUInt32BE();
                                        if (packetLength > 0x100000 || packetLength < 4) {
                                            logger.warn(
                                                `Invalid packet length during server identification: ${packetLength}. Discarding buffer.`
                                            );
                                            stream.destroy();
                                            break;
                                        }

                                        data1 = stream.read(packetLength - 4);
                                        if (!data1) break;

                                        const signature = Buffer.from([0x00, 0x63, 0x33, 0x53, 0x42, 0x00]); //c3SB??
                                        if (Buffer.compare(data1.subarray(5, 5 + signature.length), signature) !== 0)
                                            break;

                                        if (current_server !== src_server) {
                                            current_server = src_server;
                                            clearTcpCache();
                                            tcp_next_seq = tcpPacket.info.seqno + buf.length;
                                            clearDataOnServerChange();
                                            logger.info('Got Scene Server Address: ' + src_server);
                                        }
                                    } while (data1 && data1.length);
                                }
                            }
                            if (buf.length === 0x62) {
                                const signature = Buffer.from([
                                    0x00, 0x00, 0x00, 0x62, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x11, 0x45, 0x14,
                                    0x00, 0x00, 0x00, 0x00, 0x0a, 0x4e, 0x08, 0x01, 0x22, 0x24,
                                ]);
                                if (
                                    Buffer.compare(buf.subarray(0, 10), signature.subarray(0, 10)) === 0 &&
                                    Buffer.compare(buf.subarray(14, 14 + 6), signature.subarray(14, 14 + 6)) === 0
                                ) {
                                    if (current_server !== src_server) {
                                        current_server = src_server;
                                        clearTcpCache();
                                        tcp_next_seq = tcpPacket.info.seqno + buf.length;
                                        clearDataOnServerChange();
                                        logger.info('Got Scene Server Address by Login Return Packet: ' + src_server);
                                    }
                                }
                            }
                        } catch (e) {
                            // Server identification packet parsing failed - this is expected for non-game traffic
                            logger.debug(`Server identification failed: ${e.message}`);
                        }
                        try {
                            //Attempt to identify the server through a reported small packet
                            if (buf[4] == 0 && buf[5] == 5) {
                                const data = buf.subarray(10);
                                if (data.length) {
                                    const stream = Readable.from(data, { objectMode: false });
                                    let data1;
                                    do {
                                        const len_buf = stream.read(4);
                                        if (!len_buf) break;
                                        data1 = stream.read(len_buf.readUInt32BE() - 4);
                                        const signature = Buffer.from([0x00, 0x06, 0x26, 0xad, 0x66, 0x00]);
                                        if (Buffer.compare(data1.subarray(5, 5 + signature.length), signature)) break;
                                        try {
                                            if (current_server !== src_server_re) {
                                                current_server = src_server_re;
                                                clearTcpCache();
                                                tcp_next_seq = tcpPacket.info.ackno;
                                                clearDataOnServerChange();
                                                logger.info('Got Scene Server Address by FrameUp Notify Packet: ' + src_server_re);
                                            }
                                        } catch (e) {}
                                    } while (data1 && data1.length);
                                }
                            }
                        } catch (e) {
                            // Server identification packet parsing failed - this is expected for non-game traffic
                            logger.debug(`Server identification failed: ${e.message}`);
                        }
                        return;
                    }

                    if (tcp_next_seq === -1) {
                        if (buf.length > 4 && buf.readUInt32BE() < 0x0fffff) {
                            tcp_next_seq = tcpPacket.info.seqno;
                        } else {
                            logger.error('Unexpected TCP capture error! tcp_next_seq is -1');
                        }
                    }

                    if (tcp_next_seq - tcpPacket.info.seqno <= 0 || tcp_next_seq === -1) {
                        // Check cache size limit to prevent unbounded growth
                        if (tcp_cache.size >= TCP_CACHE_MAX_SIZE) {
                            logger.warn(`TCP cache size limit reached (${TCP_CACHE_MAX_SIZE}), clearing oldest entries`);
                            // Remove oldest entries (first entries in Map)
                            const entriesToRemove = Math.floor(TCP_CACHE_MAX_SIZE * 0.3); // Remove 30%
                            let removed = 0;
                            for (const key of tcp_cache.keys()) {
                                if (removed >= entriesToRemove) break;
                                tcp_cache.delete(key);
                                removed++;
                            }
                        }
                        tcp_cache.set(tcpPacket.info.seqno, buf);
                    }

                    while (tcp_cache.has(tcp_next_seq)) {
                        const seq = tcp_next_seq;
                        const cachedTcpData = tcp_cache.get(seq);
                        _data = _data.length === 0 ? cachedTcpData : Buffer.concat([_data, cachedTcpData]);
                        tcp_next_seq = (seq + cachedTcpData.length) >>> 0;
                        tcp_cache.delete(seq);
                        tcp_last_time = Date.now();
                    }

                    while (_data.length > 4) {
                        const packetSize = _data.readUInt32BE();
                        if (_data.length < packetSize) break;
                        if (packetSize > 0x0fffff) {
                            logger.error(
                                `Invalid Length!! ${_data.length},${packetSize},${_data.toString('hex')},${tcp_next_seq}`
                            );
                            _data = Buffer.alloc(0);
                            break;
                        }
                        if (_data.length >= packetSize) {
                            const packet = _data.subarray(0, packetSize);
                            _data = _data.subarray(packetSize);
                            try {
                                const processor = new PacketProcessor();
                                processor.processPacket(packet);
                            } catch (e) {
                                logger.error(`Error processing packet: ${e.message}`);
                                // Continue processing other packets even if one fails
                            }
                        }
                    }
                } finally {
                    tcp_lock.release();
                }
            };

            (async () => {
                while (PacketInterceptor.isRunning) {
                    if (eth_queue.length) {
                        const pkt = eth_queue.shift();
                        try {
                            await processEthPacket(pkt);
                        } catch (e) {
                            logger.error(`Error in packet processing loop: ${e.message}`);
                            // Continue processing even if one packet fails
                        }
                    } else {
                        await new Promise((r) => setTimeout(r, 1));
                    }
                }
            })();

            PacketInterceptor.cleanupInterval = setInterval(() => {
                if (!PacketInterceptor.isRunning) return;

                const now = Date.now();
                let clearedFragments = 0;
                fragmentIpCache.forEach((cacheEntry, key) => {
                    if (now - cacheEntry.timestamp > FRAGMENT_TIMEOUT) {
                        fragmentIpCache.delete(key);
                        clearedFragments++;
                    }
                });
                if (clearedFragments > 0) {
                    logger.debug(`Cleared ${clearedFragments} expired IP fragment caches`);
                }
                if (tcp_last_time && Date.now() - tcp_last_time > FRAGMENT_TIMEOUT) {
                    logger.warn(
                        'Cannot capture the next packet! Is the game closed or disconnected? seq: ' + tcp_next_seq
                    );
                    current_server = '';
                    clearTcpCache();
                }
            }, 10000);

            resolve(url);
        });
    }
}
