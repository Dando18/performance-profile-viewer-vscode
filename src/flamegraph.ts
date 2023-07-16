import * as vscode from 'vscode';
import { ProfilerOutput, ProfilerOutputTree, ProfilerOutputNode } from './profileroutput';


class ProfileFlameGraphDocument implements vscode.CustomDocument {
    public uri: vscode.Uri;
    public profilerOutput: ProfilerOutput;

    constructor(uri: vscode.Uri) {
        this.uri = uri;
        this.profilerOutput = ProfilerOutput.fromUri(uri);
    }

    async getContents(): Promise<ProfilerOutputTree> {
        return this.profilerOutput.getTree();
    }

    dispose() {
        this.profilerOutput.dispose();
    }
};

export class FlameGraphView implements vscode.CustomReadonlyEditorProvider {
    public static viewType = 'profileviewer.profileFlameGraphViewer';
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async resolveCustomEditor(
        document: ProfileFlameGraphDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.title = 'FlameGraph Viewer';

        webviewPanel.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
        };

        webviewPanel.webview.onDidReceiveMessage(this.onDidReceiveMessage, undefined, this.context.subscriptions);
        
        const tree = await document.getContents();
        tree.setValueMetric("time (inc)", true);
        webviewPanel.webview.html = this.getHtmlForWebview(tree.getTreeWithSingleRoot());
    }

    openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
        return new ProfileFlameGraphDocument(uri);
    }

    private onDidReceiveMessage(message: any) {
    }

    private getHtmlForWebview(tree: ProfilerOutputNode): string {
        const treeString: string = tree.toString();
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Profile Viewer</title>
            <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/d3-flame-graph@4.1.3/dist/d3-flamegraph.css">
        </head>
        <body>
            <div id="chart"></div>
            <script type="text/javascript" src="https://d3js.org/d3.v7.js"></script>
            <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/d3-flame-graph@4.1.3/dist/d3-flamegraph.min.js"></script>
            <script type="text/javascript">
                var data = ${treeString};
                var chart = flamegraph()
                    .width(960);
                d3.select("#chart")
                    .datum(data)
                    .call(chart);
            </script>
        </body>
        </html>`;
    }
};