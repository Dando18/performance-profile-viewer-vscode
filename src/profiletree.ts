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
        webviewPanel.webview.onDidReceiveMessage(this.onDidReceiveMessage, undefined, this.context.subscriptions);

        // Set the webview's initial html content
        document.getContents().then(async (tree: ProfilerOutputTree) => {
            webviewPanel.webview.html = await this.getHtmlForWebview(tree, webviewPanel.webview);
        }, (reason: any) => {
            vscode.window.showErrorMessage(`Error parsing profile: ${reason.message}`);
        });
    }
  
    openCustomDocument(_uri: vscode.Uri): vscode.CustomDocument {
        return new ProfileTreeDocument(_uri);
    }

    private onDidReceiveMessage(message: any) {
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

    private getTimeHtmlElement(time: number, maxTime: number): string {
        const color = this.scaleColor(time / maxTime);
        return `<span style="color: ${color};">${time.toFixed(4)}</span>`;
    }

    private getFilePathHtmlElement(filename: string, resolvedFilename: string | undefined, line: number | undefined): string {
        const filenameHtml = this.escapeHtml(filename);

        if (resolvedFilename) {
            return `<a style="text-decoration: underline;" class="tree__filepath" onclick="javascript:openFile('${resolvedFilename}', ${line || 0});">${filenameHtml}</a>`;
        } else {
            return `<span class="tree__filepath">${filenameHtml}</span>`;
        }
    }

    private getHotPathIcon(node: ProfilerOutputNode, isFancy: boolean = true): string {
        if (!node.isOnHotPath()) {
            return '';
        }
        if (isFancy) {
            /* todo -- add animated flame */
            return '<i class="hotpath-icon codicon codicon-flame"></i>';
        } else {
            return '<i class="hotpath-icon codicon codicon-flame"></i>';
        }
    }
    
    private async getHtmlNestedLists(node: ProfilerOutputNode, maxRunTime: number, depth: number): Promise<string> {
        let resolvedFilename = await node.getResolvedFilename();
        const line = node.getLine();

        const nameElem = this.escapeHtml(node.name);
        const incTimeElem = this.getTimeHtmlElement(node.getInclusiveTime() || 0, maxRunTime);
        const filenameElem = this.getFilePathHtmlElement(node.getFilename() || "", resolvedFilename, line);
        const hotPathElem = this.getHotPathIcon(node, true);

        /* each node is a list item */
        let htmlContent = "<li>";

        /* handle case where node has children */
        if (node.children && node.children.length > 0) {
            const detailsAttr = (depth < this.initialLevelsOpen) ? " open" : "";
            htmlContent += `<details ${detailsAttr}><summary> ${hotPathElem}(` + incTimeElem + " s) " + nameElem + " " + filenameElem + " </summary><ul>";
            /* sorted children by inclusive time */
            node.children.sort((a, b) => {
                return (b.getInclusiveTime() || 0) - (a.getInclusiveTime() || 0);
            });

            /* create each child node */
            for (let child of node.children) {
                if (child) {
                    htmlContent += await this.getHtmlNestedLists(child, maxRunTime, depth + 1);
                }
            }
            htmlContent += "</ul></details>";
        } else {
            htmlContent += '<span class="tree__root">(' + incTimeElem + " s) " + nameElem + " " + filenameElem + "</span>";
        }
        htmlContent += "</li>";
        return htmlContent;
    }

    private async getHtmlForWebview(tree: ProfilerOutputTree, webview: vscode.Webview): Promise<string> {
        if (!this.htmlTemplate) {
            return '';
        }
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

        let maxRunTime = tree.getMaxInclusiveTime();
        let htmlLists = "";
        for (let root of tree.roots) {
            htmlLists += '<ul class="tree">';
            htmlLists += await this.getHtmlNestedLists(root, maxRunTime, 0);
            htmlLists += "</ul>";
        }
        let htmlContent = this.htmlTemplate.replace("{{ data }}", htmlLists);
        htmlContent = htmlContent.replace("{{ codiconsUri }}", codiconsUri.toString());
        htmlContent = htmlContent.replace("{{ cspSource }}", webview.cspSource);
        return htmlContent;
    }
  }