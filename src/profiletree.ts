import * as vscode from 'vscode';
import * as path from 'path';
import { ProfilerOutput, ProfilerOutputTree, ProfilerOutputNode } from './profileroutput';

/**
 * Custom document type for profile trees. Allows the tree to be opened
 * inside a custom editor. Initialized with a URI and returns a 
 * ProfilerOutputTree on getContents().
 */
class ProfileTreeDocument implements vscode.CustomDocument {
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

/**
 * Custom readonly editor window. Defines the webview panel for displaying tree
 * data from ProfilerOutputTree objects. 
 */
export class ProfileTreeEditor implements vscode.CustomReadonlyEditorProvider {
    public static viewType = 'profileviewer.profileTreeEditor';

    private readonly context: vscode.ExtensionContext;
    private readonly initialLevelsOpen: number;
    private readonly htmlPath: string = path.join('src', 'html', 'profiletree.html');
    public htmlTemplate: string | undefined;

    constructor(context: vscode.ExtensionContext, initialLevelsOpen: number = 3) {
        this.context = context;
        this.initialLevelsOpen = initialLevelsOpen;

        /* read html template from htmlPath */
        const htmlUri: vscode.Uri = vscode.Uri.joinPath(context.extensionUri, this.htmlPath);
        vscode.workspace.fs.readFile(htmlUri).then((value: Uint8Array) => {
            this.htmlTemplate = Buffer.from(value).toString();
        });

        /* register as custom editor */
        context.subscriptions.push(vscode.window.registerCustomEditorProvider(ProfileTreeEditor.viewType, this, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: true,
        }));
    }

    async resolveCustomEditor(
      document: ProfileTreeDocument,
      webviewPanel: vscode.WebviewPanel,
      _token: vscode.CancellationToken
    ): Promise<void> {
        // Set the webview panel's title and icon
        webviewPanel.title = 'Profile Tree';
        
        // Enable the HTML content security policy
        webviewPanel.webview.options = {
            enableScripts: true,
		    enableCommandUris: true,
        };

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage((msg) => this.onDidReceiveMessage(msg, webviewPanel, document), undefined, this.context.subscriptions);

        // Set the webview's initial html content
        document.profilerOutput.setContext(this.context);
        document.getContents().then(async (tree: ProfilerOutputTree) => {
            webviewPanel.webview.html = await this.getHtmlForWebview(tree, webviewPanel.webview, "time (inc)");
        }, (reason: any) => {
            if (reason.code && reason.code === "1001") {
                this.context.workspaceState.update("pythonWithHatchetPath", undefined);
                vscode.window.showErrorMessage(`Could not find Hatchet install. Run 'pip install hatchet' in your python environment.\nError parsing profile: ${reason.message}.`);
            } else {
                vscode.window.showErrorMessage(`Error parsing profile: ${reason.message}`);
            }
        });
    }
  
    openCustomDocument(_uri: vscode.Uri): vscode.CustomDocument {
        return new ProfileTreeDocument(_uri);
    }

    private onDidReceiveMessage(message: any, webviewPanel: vscode.WebviewPanel, document: ProfileTreeDocument) {
        switch (message.command) {
            case 'open':
                /* open message.path as textdocument and move cursor to message.line */
                vscode.workspace.openTextDocument(message.path).then((doc: vscode.TextDocument) => {
                    vscode.window.showTextDocument(doc).then((editor: vscode.TextEditor) => {
                        if (message.line) {
                            const line = message.line - 1;
                            const position = new vscode.Position(line, 0);
                            editor.selection = new vscode.Selection(position, position);
                            editor.revealRange(new vscode.Range(position, position));
                        }
                    });
                });
                break;
            case 'changeMetric':
                const newMetric = message.metric || "time (inc)";
                document.getContents().then(async (tree: ProfilerOutputTree) => {
                    webviewPanel.webview.html = await this.getHtmlForWebview(tree, webviewPanel.webview, newMetric);
                });
                break;
            case 'exportData':
                document.getContents().then(async (tree: ProfilerOutputTree) => {
                    /* prompt user for filename and write out tree data */
                    const exportData = tree.toString();
                    vscode.window.showSaveDialog({
                        filters: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'JSON': ['json']
                        },
                        saveLabel: "Export Profile Data",
                        title: "Export Profile Data",
                    }).then((uri: vscode.Uri | undefined) => {
                        if (uri) {
                            vscode.workspace.fs.writeFile(uri, Buffer.from(exportData));
                        }
                    });
                });
                break;
        }
    }

    private escapeHtml(s: string): string {
        return s
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
    }

    private scaleColor(value: number): string {
        value = Math.max(0, Math.min(1, value));

        var red = Math.floor(255 * value);
        var green = Math.floor(255 * (1 - value));
        var blue = 0;
        
        return "rgb(" + red + "," + green + "," + blue + ")";
    }

    private getMetricHtmlElement(value: number, maxValue: number): string {
        const color = this.scaleColor(value / maxValue);
        return `<span style="color: ${color};">${value.toFixed(4)}</span>`;
    }

    private getFilePathHtmlElement(filename: string, resolvedFilename: string | undefined, line: number | undefined): string {
        const filenameHtml = this.escapeHtml(filename);

        if (resolvedFilename) {
            return `<a style="text-decoration: underline;" class="tree__filepath" onclick="javascript:openFile('${resolvedFilename}', ${line || 0});">${filenameHtml}</a>`;
        } else {
            return `<span class="tree__filepath">${filenameHtml}</span>`;
        }
    }

    private getHotPathIcon(node: ProfilerOutputNode): string {
        if (!node.isOnHotPath()) {
            return '';
        }
        if (vscode.workspace.getConfiguration("profileviewer").get("animatedHotPathIcons") === true) {
            return '<i class="hotpath-icon fancy-hotpath-icon codicon codicon-flame"></i>';
        } else {
            return '<i class="hotpath-icon codicon codicon-flame"></i>';
        }
    }

    private getMetricsAsHTMLOptions(tree: ProfilerOutputTree, selected?: string): string {
        const metrics = tree.getAvailableMetrics(false, '_');

        /* set the selected string based on that provided */
        let selectedIdx: number = 0;
        if (selected) {
            selectedIdx = metrics.indexOf(selected);
            if (selectedIdx === -1) {
                selectedIdx = 0;
            }
        }

        /* create an option html element for each metric */
        const metricOptions = metrics.map((metric: string, idx: number): string => {
            const selected = (selectedIdx === idx) ? "selected" : "";
            return `<option class="metric__option" value="${metric}" ${selected}>${metric}</option>`;
        });
        return metricOptions.join("");
    }
    
    private async getHtmlNestedLists(node: ProfilerOutputNode, metric: string, maxMetricValue: number, depth: number): Promise<string> {
        let resolvedFilename = await node.getResolvedFilename();
        const line = node.getLine();

        const nameElem = this.escapeHtml(node.name);
        const metricElem = this.getMetricHtmlElement(node.getMetricValue(metric) || 0, maxMetricValue);
        const filenameElem = this.getFilePathHtmlElement(node.getFilename() || "", resolvedFilename, line);
        const hotPathElem = this.getHotPathIcon(node);

        /* each node is a list item */
        let htmlContent = "<li>";

        /* handle case where node has children */
        if (node.children && node.children.length > 0) {
            const detailsAttr = (depth < this.initialLevelsOpen) ? " open" : "";
            htmlContent += `<details ${detailsAttr}><summary> ${hotPathElem}(` + metricElem + " s) " + nameElem + " " + filenameElem + " </summary><ul>";
            /* sorted children by inclusive time */
            node.children.sort((a, b) => {
                return (b.getMetricValue(metric) || 0) - (a.getMetricValue(metric) || 0);
            });

            /* create each child node */
            for (let child of node.children) {
                if (child) {
                    htmlContent += await this.getHtmlNestedLists(child, metric, maxMetricValue, depth + 1);
                }
            }
            htmlContent += "</ul></details>";
        } else {
            htmlContent += '<span class="tree__root">(' + metricElem + " s) " + nameElem + " " + filenameElem + "</span>";
        }
        htmlContent += "</li>";
        return htmlContent;
    }

    private async getHtmlForWebview(tree: ProfilerOutputTree, webview: vscode.Webview, metric: string): Promise<string> {
        if (!this.htmlTemplate) {
            return '';
        }
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

        const maxMetricValue = tree.getMaxMetricValue(metric, true);
        let htmlLists = "";
        for (let root of tree.roots) {
            htmlLists += '<ul class="tree">';
            htmlLists += await this.getHtmlNestedLists(root, metric, maxMetricValue, 0);
            htmlLists += "</ul>";
        }
        let htmlContent = this.htmlTemplate.replace("{{ data }}", htmlLists);
        htmlContent = htmlContent.replace("{{ availableMetrics }}", this.getMetricsAsHTMLOptions(tree, metric));
        htmlContent = htmlContent.replace("{{ codiconsUri }}", codiconsUri.toString());
        htmlContent = htmlContent.replace("{{ cspSource }}", webview.cspSource);
        return htmlContent;
    }
  }