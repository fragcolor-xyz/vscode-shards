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

	private async waitForConnection(
		address: string, 
		port: number, 
		maxRetries: number, 
		retryInterval: number
	): Promise<boolean> {
		return new Promise((resolve) => {
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Shards Debug Connection",
					cancellable: true
				},
				async (progress, token) => {
					let attempt = 1;
					let cancelled = false;

					// Handle cancellation
					token.onCancellationRequested(() => {
						cancelled = true;
						vscode.window.showWarningMessage('Debug connection attempt cancelled');
						resolve(false);
					});

					// Initial progress report
					progress.report({ 
						increment: 0, 
						message: `Connecting to ${address}:${port}...` 
					});

					while (attempt <= maxRetries && !cancelled) {
						const connected = await this.checkConnection(address, port);
						
						if (connected) {
							progress.report({ 
								increment: 100, 
								message: `Connected successfully!` 
							});
							// vscode.window.showInformationMessage(`Connected to Shards debug server at ${address}:${port}`);
							resolve(true);
							return;
						}

						// Calculate progress percentage
						const progressPercent = (attempt / maxRetries) * 100;
						const increment = progressPercent - ((attempt - 1) / maxRetries) * 100;

						if (attempt < maxRetries) {
							progress.report({ 
								increment: increment, 
								message: `Attempt ${attempt}/${maxRetries} failed. Retrying in ${retryInterval/1000}s...` 
							});
							
							// Wait for retry interval, but check for cancellation periodically
							const startTime = Date.now();
							while (Date.now() - startTime < retryInterval && !cancelled) {
								await new Promise(resolve => setTimeout(resolve, 100));
							}
						} else {
							progress.report({ 
								increment: increment, 
								message: `All attempts failed` 
							});
						}

						attempt++;
					}

					if (!cancelled) {
						resolve(false);
					}
				}
			);
		});
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