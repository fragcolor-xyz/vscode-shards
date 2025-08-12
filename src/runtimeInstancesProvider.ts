import * as vscode from 'vscode';
import { ShardsDiscoveryService } from './discoveryService';

export interface ShardsRuntimeInstance {
    id: string;
    name: string;
    executableArgs: string;
    port: number;
    ipAddress: string;
    isRunning: boolean;
}

export class ShardsRuntimeInstanceTreeItem extends vscode.TreeItem {
    constructor(
        public readonly instance: ShardsRuntimeInstance,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(instance.name, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.contextValue = 'runtimeInstance';
        this.iconPath = instance.isRunning 
            ? new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'))
            : new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('charts.red'));
            
        // Enable command when instance is running
        if (instance.isRunning) {
            this.command = {
                command: 'shards.attachToInstance',
                title: 'Attach Debugger',
                arguments: [instance]
            };
        }
    }

    private getTooltip(): string {
        const status = this.instance.isRunning ? 'Running' : 'Stopped';
        return `${this.instance.name}\n` +
               `Status: ${status}\n` +
               `Port: ${this.instance.port}\n` +
               `IP: ${this.instance.ipAddress}\n` +
               `Args: ${this.instance.executableArgs}`;
    }

    private getDescription(): string {
        const status = this.instance.isRunning ? '●' : '○';
        return `${status} ${this.instance.ipAddress}:${this.instance.port}`;
    }
}

export class ShardsRuntimeInstancesProvider implements vscode.TreeDataProvider<ShardsRuntimeInstanceTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ShardsRuntimeInstanceTreeItem | undefined | null | void> = new vscode.EventEmitter<ShardsRuntimeInstanceTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ShardsRuntimeInstanceTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _instances: ShardsRuntimeInstance[] = [];
    private _discoveryService: ShardsDiscoveryService;

    constructor() {
        this._discoveryService = new ShardsDiscoveryService();
        
        // Listen for discovered instances
        this._discoveryService.onInstancesUpdated((instances) => {
            this._instances = instances;
            this._onDidChangeTreeData.fire();
        });
    }

    getTreeItem(element: ShardsRuntimeInstanceTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ShardsRuntimeInstanceTreeItem): Thenable<ShardsRuntimeInstanceTreeItem[]> {
        if (element) {
            // No children for runtime instances
            return Promise.resolve([]);
        } else {
            // Return all runtime instances as root items
            return Promise.resolve(this._instances.map(instance => 
                new ShardsRuntimeInstanceTreeItem(instance, vscode.TreeItemCollapsibleState.None)
            ));
        }
    }

    public attachToInstance(instance: ShardsRuntimeInstance) {
        // Create debug configuration
        const debugConfig: vscode.DebugConfiguration = {
            type: 'shards',
            request: 'attach',
            name: `Attach to ${instance.name}`,
            port: instance.port,
            address: instance.ipAddress,
            maxRetries: 10,
            retryInterval: 2000
        };

        // Start debugging session
        vscode.debug.startDebugging(undefined, debugConfig).then(
            (success) => {
                if (success) {
                    console.log(`Successfully attached to "${instance.name}"`);
                } else {
                    vscode.window.showErrorMessage(`Failed to attach to "${instance.name}"`);
                }
            },
            (error) => {
                vscode.window.showErrorMessage(`Error attaching to "${instance.name}": ${error.message}`);
            }
        );
    }

    public async selectAndAttachToInstance() {
        const runningInstances = this._instances.filter(instance => instance.isRunning);
        
        if (runningInstances.length === 0) {
            vscode.window.showWarningMessage('No running Shards instances found. Make sure Shards applications are running with debug mode enabled.');
            return;
        }

        // Create quick pick items
        const quickPickItems = runningInstances.map(instance => ({
            label: instance.name,
            description: `${instance.ipAddress}:${instance.port}`,
            detail: instance.executableArgs,
            instance: instance
        }));

        // Show quick pick
        const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a Shards runtime instance to attach to',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selectedItem) {
            this.attachToInstance(selectedItem.instance);
        }
    }

    public dispose() {
        this._discoveryService.dispose();
    }
}