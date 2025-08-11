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

export class ShardsRuntimeInstancesProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'shardsRuntimeInstances';

    private _view?: vscode.WebviewView;
    private _instances: ShardsRuntimeInstance[] = [];
    private _discoveryService: ShardsDiscoveryService;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._discoveryService = new ShardsDiscoveryService();
        
        // Listen for discovered instances
        this._discoveryService.onInstancesUpdated((instances) => {
            this._instances = instances;
            this._updateWebview();
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'attach':
                        this._attachToInstance(message.instanceId);
                        break;
                    case 'refresh':
                        this._refreshInstances();
                        break;
                }
            },
            undefined,
            []
        );

        // Update the webview content
        this._updateWebview();
    }

    private _attachToInstance(instanceId: string) {
        const instance = this._instances.find(i => i.id === instanceId);
        if (!instance) {
            vscode.window.showErrorMessage(`Runtime instance with ID ${instanceId} not found`);
            return;
        }

        if (!instance.isRunning) {
            vscode.window.showWarningMessage(`Runtime instance "${instance.name}" is not running`);
            return;
        }

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

    private _refreshInstances() {
        // Refresh the discovery service
        this._discoveryService.refresh();
        vscode.window.showInformationMessage('Refreshing Shards runtime instances...');
    }

    private _updateWebview() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateInstances',
                instances: this._instances
            });
        }
    }

    public addInstance(instance: ShardsRuntimeInstance) {
        this._instances.push(instance);
        this._updateWebview();
    }

    public removeInstance(instanceId: string) {
        this._instances = this._instances.filter(i => i.id !== instanceId);
        this._updateWebview();
    }

    public updateInstanceStatus(instanceId: string, isRunning: boolean) {
        const instance = this._instances.find(i => i.id === instanceId);
        if (instance) {
            instance.isRunning = isRunning;
            this._updateWebview();
        }
    }

    private _truncateArgs(args: string, maxLength: number = 50): string {
        if (args.length <= maxLength) {
            return args;
        }
        return args.substring(0, maxLength - 3) + '...';
    }

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shards Runtime Instances</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 8px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-sideBar-border);
        }

        .header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
        }

        .refresh-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 11px;
        }

        .refresh-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .instance-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .instance-item {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-sideBar-border);
            border-radius: 4px;
            padding: 8px;
            position: relative;
        }

        .instance-item.running {
            border-left: 3px solid var(--vscode-charts-green);
        }

        .instance-item.stopped {
            border-left: 3px solid var(--vscode-charts-red);
            opacity: 0.7;
        }

        .instance-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }

        .instance-name {
            font-weight: 600;
            font-size: 13px;
        }

        .status-badge {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
        }

        .status-badge.running {
            background: var(--vscode-charts-green);
            color: var(--vscode-sideBar-background);
        }

        .status-badge.stopped {
            background: var(--vscode-charts-red);
            color: var(--vscode-sideBar-background);
        }

        .instance-details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }

        .detail-row {
            display: flex;
            margin-bottom: 2px;
        }

        .detail-label {
            font-weight: 500;
            width: 50px;
            flex-shrink: 0;
        }

        .detail-value {
            flex: 1;
            word-break: break-all;
        }

        .attach-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
            width: 100%;
            justify-content: center;
        }

        .attach-btn:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        .attach-btn:disabled {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
            opacity: 0.6;
        }

        .play-icon {
            font-size: 10px;
        }

        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 20px;
        }

        .discovery-info {
            background: var(--vscode-editorInfo-background);
            border: 1px solid var(--vscode-editorInfo-border);
            border-radius: 3px;
            padding: 8px;
            margin-bottom: 12px;
            font-size: 11px;
            color: var(--vscode-editorInfo-foreground);
        }

        .network-info {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>Shards Runtime Instances</h3>
        <button class="refresh-btn" onclick="refresh()">Refresh</button>
    </div>
    
    <div class="discovery-info">
        🔍 Listening for Shards debug adapter announcements on UDP port 57426
    </div>
    
    <div id="instanceList" class="instance-list">
        <div class="empty-state">
            No runtime instances discovered yet. Make sure Shards applications are running with debug mode enabled.
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function attachToInstance(instanceId) {
            vscode.postMessage({ 
                command: 'attach', 
                instanceId: instanceId 
            });
        }

        function truncateText(text, maxLength = 50) {
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength - 3) + '...';
        }

        function updateInstances(instances) {
            const listElement = document.getElementById('instanceList');
            
            if (instances.length === 0) {
                listElement.innerHTML = '<div class="empty-state">No runtime instances found. Click refresh to scan for running instances.</div>';
                return;
            }

            listElement.innerHTML = instances.map(instance => {
                const statusClass = instance.isRunning ? 'running' : 'stopped';
                const statusText = instance.isRunning ? 'Running' : 'Stopped';
                const attachDisabled = !instance.isRunning ? 'disabled' : '';
                
                return \`
                    <div class="instance-item \${statusClass}">
                        <div class="instance-header">
                            <div class="instance-name">\${instance.name}</div>
                            <div class="status-badge \${statusClass}">\${statusText}</div>
                        </div>
                        <div class="instance-details">
                            <div class="detail-row">
                                <span class="detail-label">Args:</span>
                                <span class="detail-value" title="\${instance.executableArgs}">\${truncateText(instance.executableArgs, 40)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Port:</span>
                                <span class="detail-value network-info">\${instance.port}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">IP:</span>
                                <span class="detail-value network-info">\${instance.ipAddress}</span>
                            </div>
                        </div>
                        <button class="attach-btn" onclick="attachToInstance('\${instance.id}')" \${attachDisabled}>
                            <span class="play-icon">▶</span>
                            Attach Debugger
                        </button>
                    </div>
                \`;
            }).join('');
        }

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateInstances':
                    updateInstances(message.instances);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        this._discoveryService.dispose();
    }
}