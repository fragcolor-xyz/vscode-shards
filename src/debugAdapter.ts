import * as vscode from 'vscode';
import * as Net from 'net';

class ShardsRemoteDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private async checkConnection(address: string, port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = new Net.Socket();
			const timeout = 1000; // 1 second timeout per attempt

			socket.setTimeout(timeout);
			
			socket.on('connect', () => {
				socket.destroy();
				resolve(true);
			});

			socket.on('timeout', () => {
				socket.destroy();
				resolve(false);
			});

			socket.on('error', () => {
				socket.destroy();
				resolve(false);
			});

			socket.connect(port, address);
		});
	}

	private async waitForConnection(address: string, port: number, maxRetries: number, retryInterval: number): Promise<boolean> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const connected = await this.checkConnection(address, port);
			
			if (connected) {
				vscode.window.showInformationMessage(`Connected to Shards debug server at ${address}:${port} (attempt ${attempt}/${maxRetries})`);
				return true;
			}

			if (attempt < maxRetries) {
				vscode.window.showInformationMessage(`Waiting for Shards debug server at ${address}:${port} (attempt ${attempt}/${maxRetries})...`);
				await new Promise(resolve => setTimeout(resolve, retryInterval));
			}
		}

		return false;
	}

	async createDebugAdapterDescriptor(session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor | null> {

		// Get port and address from session configuration, with defaults
		const port = session.configuration.port || 57427;
		const address = session.configuration.address || "127.0.0.1";
		const maxRetries = session.configuration.maxRetries || 10;
		const retryInterval = session.configuration.retryInterval || 2000; // 2 seconds

		// Wait for the debug server to become available
		const connected = await this.waitForConnection(address, port, maxRetries, retryInterval);

		if (!connected) {
			const totalWaitTime = Math.round((maxRetries * retryInterval) / 1000);
			vscode.window.showErrorMessage(`Failed to connect to Shards debug server at ${address}:${port} after ${totalWaitTime} seconds. Please ensure the debug server is running.`);
			return null;
		}

		// Make VS Code connect to debug server
		return new vscode.DebugAdapterServer(port, address);
	}
}

export { ShardsRemoteDebugAdapterServerDescriptorFactory };