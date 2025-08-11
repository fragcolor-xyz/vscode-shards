import * as dgram from 'dgram';
import { ShardsRuntimeInstance } from './runtimeInstancesProvider';
import { log } from './log';

export interface ShardsDiscoveryMessage {
    service: string;
    instance: {
        name: string;
        port: number;
        protocol: string;
        args?: string;
    };
    version: string;
    capabilities: {
        [key: string]: boolean;
    };
}

export class ShardsDiscoveryService {
    private socket: dgram.Socket | null = null;
    private isListening = false;
    private discoveredInstances = new Map<string, ShardsRuntimeInstance>();
    private callbacks: ((instances: ShardsRuntimeInstance[]) => void)[] = [];
    private instanceTimeouts = new Map<string, NodeJS.Timeout>();
    private readonly DISCOVERY_PORT = 57426;
    private readonly INSTANCE_TIMEOUT = 30000; // 30 seconds timeout

    constructor() {
        this.startListening();
    }

    public onInstancesUpdated(callback: (instances: ShardsRuntimeInstance[]) => void) {
        this.callbacks.push(callback);
        // Immediately call with current instances
        callback(Array.from(this.discoveredInstances.values()));
    }

    public getInstances(): ShardsRuntimeInstance[] {
        return Array.from(this.discoveredInstances.values());
    }

    private startListening() {
        if (this.isListening) {
            return;
        }

        try {
            this.socket = dgram.createSocket('udp4');
            
            this.socket.on('error', (err) => {
                log(`Discovery service error: ${err.message}`);
                this.stopListening();
                // Retry after a delay
                setTimeout(() => this.startListening(), 5000);
            });

            this.socket.on('message', (msg, rinfo) => {
                this.handleDiscoveryMessage(msg.toString(), rinfo.address);
            });

            this.socket.on('listening', () => {
                const address = this.socket?.address();
                log(`Discovery service listening on port ${address?.port || this.DISCOVERY_PORT}`);
                this.isListening = true;
            });

            // Set socket options
            this.socket.bind(this.DISCOVERY_PORT, () => {
                try {
                    this.socket?.setMulticastTTL(128);
                    this.socket?.setBroadcast(true);
                } catch (err) {
                    log(`Warning: Could not set socket options: ${err}`);
                }
            });

        } catch (error) {
            log(`Failed to start discovery service: ${error}`);
            this.stopListening();
        }
    }

    private handleDiscoveryMessage(message: string, fromAddress: string) {
        try {
            const announcement: ShardsDiscoveryMessage = JSON.parse(message);
            
            if (announcement.service === 'shards-debug-adapter') {
                this.processDiscoveryAnnouncement(announcement, fromAddress);
            }
        } catch (error) {
            // Ignore invalid JSON or non-Shards messages
            log(`Invalid discovery message from ${fromAddress}: ${error}`);
        }
    }

    private processDiscoveryAnnouncement(announcement: ShardsDiscoveryMessage, fromAddress: string) {
        const instanceKey = `${fromAddress}:${announcement.instance.port}`;
        
        // Create or update instance
        const instance: ShardsRuntimeInstance = {
            id: instanceKey,
            name: announcement.instance.name || `Shards Instance (${announcement.instance.port})`,
            executableArgs: announcement.instance.args || 'shards run --debug',
            port: announcement.instance.port,
            ipAddress: fromAddress,
            isRunning: true
        };

        log(`Discovered Shards instance: ${instance.name} at ${fromAddress}:${announcement.instance.port}`);

        // Update or add instance
        this.discoveredInstances.set(instanceKey, instance);

        // Clear existing timeout for this instance
        const existingTimeout = this.instanceTimeouts.get(instanceKey);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Set new timeout to mark instance as stopped if no more announcements
        const timeout = setTimeout(() => {
            this.markInstanceAsStopped(instanceKey);
        }, this.INSTANCE_TIMEOUT);
        
        this.instanceTimeouts.set(instanceKey, timeout);

        // Notify callbacks
        this.notifyInstancesUpdated();
    }

    private markInstanceAsStopped(instanceKey: string) {
        const instance = this.discoveredInstances.get(instanceKey);
        if (instance && instance.isRunning) {
            instance.isRunning = false;
            log(`Instance ${instance.name} at ${instanceKey} marked as stopped (no announcements received)`);
            this.notifyInstancesUpdated();
        }

        // Clean up timeout
        this.instanceTimeouts.delete(instanceKey);
    }

    private notifyInstancesUpdated() {
        const instances = Array.from(this.discoveredInstances.values());
        this.callbacks.forEach(callback => {
            try {
                callback(instances);
            } catch (error) {
                log(`Error in discovery callback: ${error}`);
            }
        });
    }

    public stopListening() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isListening = false;

        // Clear all timeouts
        this.instanceTimeouts.forEach(timeout => clearTimeout(timeout));
        this.instanceTimeouts.clear();

        log('Discovery service stopped');
    }

    public refresh() {
        log('Refreshing discovery service...');
        
        // Mark all current instances as potentially stopped
        this.discoveredInstances.forEach(instance => {
            if (instance.isRunning) {
                instance.isRunning = false;
            }
        });

        // Clear all timeouts
        this.instanceTimeouts.forEach(timeout => clearTimeout(timeout));
        this.instanceTimeouts.clear();

        this.notifyInstancesUpdated();

        // If not listening, try to start
        if (!this.isListening) {
            this.startListening();
        }
    }

    public dispose() {
        this.stopListening();
        this.callbacks.length = 0;
        this.discoveredInstances.clear();
    }
}