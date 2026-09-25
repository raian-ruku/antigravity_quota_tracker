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

  // Select focus model or auto-detect
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaTracker.selectFocusModel', async () => {
      const models = dataService.state.models || [];
      const currentActive = dataService.state.activeModelId;

      const items: vscode.QuickPickItem[] = [
        {
          label: '$(sparkle) Auto-Detect (Follow Active Agent Model)',
          description: 'Automatically switches to whatever model the agent is currently using',
          detail: 'Recommended',
        },
        ...models.map(m => ({
          label: `$(robot) ${m.displayName}`,
          description: `${Math.round((1 - (m.requests.used / m.requests.limit)) * 100)}% remaining${m.modelId === currentActive ? ' (active)' : ''}`,
          detail: m.groupName ? `Shared Pool: ${m.groupName}` : undefined,
        })),
      ];

      const selected = await vscode.window.showQuickPick(items, {
        title: 'Quota Tracker — Select Model Focus',
        placeHolder: 'Select a model to pin, or choose Auto-Detect',
      });

      if (!selected) { return; }

      if (selected.label.includes('Auto-Detect')) {
        await vscode.workspace.getConfiguration('quotaTracker')
          .update('focusModel', 'auto', vscode.ConfigurationTarget.Global);
        dataService.setActiveModel(null);
        vscode.window.setStatusBarMessage('$(sparkle) Quota tracker set to Auto-Detect model', 2000);
      } else {
        const found = models.find(m => selected.label.includes(m.displayName));
        if (found) {
          await vscode.workspace.getConfiguration('quotaTracker')
            .update('focusModel', found.modelId, vscode.ConfigurationTarget.Global);
          dataService.setActiveModel(found.modelId);
          vscode.window.setStatusBarMessage(`$(pin) Quota tracker focused on ${found.displayName}`, 2000);
        }
      }
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

  // ── Fast Active Model Detection on Window Focus ───────────
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(e => {
      if (e.focused) {
        dataService.checkActiveModel();
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
