import * as vscode from 'vscode';

export class FlameGraphView {
    private webviewPanel: vscode.WebviewPanel | undefined = undefined;

    constructor() {

    }

    show(context: vscode.ExtensionContext, profileData: any) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (this.webviewPanel) {
            this.webviewPanel.reveal(column);
        } else {
            this.webviewPanel = vscode.window.createWebviewPanel(
                'flamegraph',
                'FlameGraph Viewer',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            const data = this.convertToD3FlamegraphFormat(profileData);
            this.webviewPanel.webview.html = this.getHtmlForWebview(data);

            this.webviewPanel.onDidDispose(() => {
                this.webviewPanel = undefined;
            }, null, context.subscriptions);
        }
    }

    private getHtmlForWebview(tree: Object) {
        const treeString: string = JSON.stringify(tree);
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

    private addValueProperty(node: any) {
        node.value = node.metrics["time (inc)"];
        if (node.children) {
            node.children.forEach((child: any) => this.addValueProperty(child));
        }
    }

    private convertToD3FlamegraphFormat(profileData: any): Object {
        /* handle case where there is only 1 root node */
        let root = undefined;
        if (profileData.length === 1) {
            root = profileData[0];
        } else {
            /* there are more than 1 root nodes, so create a new root node */
            root = {
                name: "root",
                value: 0,
                children: profileData
            };
        }
        this.addValueProperty(root);
        return root;
    }
};