import * as vscode from 'vscode';
import { QuotaDataService } from './quotaDataService';
import { QuotaPanel } from './quotaPanel';
import { StatusBarController } from './statusBarController';

// ─────────────────────────────────────────────────────────────
//  Extension Entry Point
// ─────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log('[QuotaTracker] Activating…');

  // ── Services ──────────────────────────────────────────────
  const dataService  = new QuotaDataService(context);
  const statusBar    = new StatusBarController(dataService);
  const panelProvider = new QuotaPanel(context.extensionUri, dataService);

  // ── Register Webview Provider ─────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      QuotaPanel.viewType,
      panelProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Wire Data → Status Bar ────────────────────────────────
  context.subscriptions.push(
    dataService.onChange(state => statusBar.update(state))
  );

  // ── Commands ──────────────────────────────────────────────

  // Open the panel in the sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.openPanel', () => {
      vscode.commands.executeCommand('quotaTracker.panel.focus');
    })
  );

  // Refresh quota data
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.refresh', async () => {
      await dataService.refresh();
      vscode.window.setStatusBarMessage('$(check) Quota data refreshed', 2000);
    })
  );

  // Cycle status bar mode (also triggered by clicking the bar item)
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.cycleMode', () => {
      statusBar.cycleMode();
    })
  );

  // Toggle status bar visibility
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.toggleStatusBar', () => {
      statusBar.toggle();
    })
  );

  // Set API key via input box
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your Antigravity / Google AI API key',
        placeHolder: 'AIza…',
        password: true,
        ignoreFocusOut: true,
      });
      if (key !== undefined) {
        await vscode.workspace.getConfiguration('quotaTracker')
          .update('apiKey', key, vscode.ConfigurationTarget.Global);
        await dataService.refresh();
        vscode.window.showInformationMessage('$(check) API key saved. Quota data refreshed.');
      }
    })
  );

  // Configure status bar placement interactively
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.configurePosition', async () => {
      // Step 1 — Alignment
      const side = await vscode.window.showQuickPick(
        [
          { label: '$(arrow-left)  Left side',  description: 'Activity bar side (default)', value: 'Left'  },
          { label: '$(arrow-right) Right side', description: 'Notifications / clock side',   value: 'Right' },
        ],
        { title: 'Quota Tracker — Status Bar Side', placeHolder: 'Choose which side of the status bar' }
      );
      if (!side) { return; }

      // Step 2 — Priority
      const cfg = vscode.workspace.getConfiguration('quotaTracker');
      const currentPriority = cfg.get<number>('statusBarPriority', 100);
      const priorityInput = await vscode.window.showInputBox({
        title: 'Quota Tracker — Position (priority)',
        prompt:
          side.value === 'Left'
            ? 'Higher number = further LEFT  (e.g. 200 = very left, 1 = near center)'
            : 'Higher number = further RIGHT (e.g. 200 = very right, 1 = near center)',
        value: String(currentPriority),
        validateInput: v => {
          const n = parseInt(v);
          return isNaN(n) || n < 0 ? 'Enter a positive number (e.g. 100)' : undefined;
        },
      });
      if (priorityInput === undefined) { return; }

      const newPriority = parseInt(priorityInput);
      await cfg.update('statusBarAlignment', side.value, vscode.ConfigurationTarget.Global);
      await cfg.update('statusBarPriority',  newPriority, vscode.ConfigurationTarget.Global);
      // recreate fires automatically via onDidChangeConfiguration
      vscode.window.setStatusBarMessage(
        `$(pulse) Quota bar moved → ${side.value} side, priority ${newPriority}`, 2500
      );
    })
  );

  // React to Configuration Changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('quotaTracker')) {
        const settings = dataService.settings;
        statusBar.setMode(settings.statusBarMode);
        dataService.scheduleRefreshWithInterval(settings.refreshInterval);
        // Recreate the item if placement properties changed
        if (
          e.affectsConfiguration('quotaTracker.statusBarAlignment') ||
          e.affectsConfiguration('quotaTracker.statusBarPriority')
        ) {
          statusBar.recreate();
        }
      }
    })
  );

  // ── Smart Refresh on File Save ────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      // Lightweight heuristic: saving code files implies AI activity
      const s = dataService.settings;
      if (s.refreshInterval > 0 && s.refreshInterval < 300) {
        dataService.refresh();
      }
    })
  );

  // ── Cleanup ───────────────────────────────────────────────
  context.subscriptions.push(
    new vscode.Disposable(() => {
      dataService.dispose();
      statusBar.dispose();
      panelProvider.dispose();
    })
  );

  console.log('[QuotaTracker] Activated ✓');
}

export function deactivate(): void {
  console.log('[QuotaTracker] Deactivated');
}
