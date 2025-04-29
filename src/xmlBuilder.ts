import { indexOf, isArray, size } from 'lodash';

import xmlScribe from 'sax-async/lib/util/xmlScribe';
import { Tag } from 'sax-async/lib/index';

import { TaskTag } from './interfaces/task.interface';
import { XmlBuilderParams } from './interfaces/builder.interface';

export class XmlBuilder {
    protected outputStream: NodeJS.WritableStream;

    // used to stash child content inside eventText
    protected lastOpenedTagName: string = '';

    protected lastClosedNodeName: string = '';
    protected isSelfClosedNode = false;
    protected skipNextContent: any = false;
    protected skipNextTags: any = [];

    protected openedNode: Partial<TaskTag>[] = [];

    // identation
    protected identation: boolean = false;
    protected identationSize = 4;
    protected identationPosition = 0;
    protected lineBreaker = '\n';
    protected isFirstOutputLine = true;

    protected checkParams(): void {
        null;
    }

    setParams(params: Partial<XmlBuilderParams>) {
        if (params.outputStream) this.outputStream = params.outputStream;
        if (params.identation !== undefined) this.identation = params.identation;
        if (params.identationSize) this.identationSize = params.identationSize;
        if (params.lineBreaker) this.lineBreaker = params.lineBreaker;
    }

    protected _shouldSkipNextContent() {
        return this.skipNextContent === true;
    }

    // this will ensure to stop writting everything after a deleted child node was summoned
    // making possible to keep identation at the right place
    protected _shouldSkipNextContentBasedOnNextTags(node: any = null) {
        if (!this.skipNextTags.length) return null;
        return this.skipNextTags.indexOf(node.name) > -1;
    }
    // #region getters
    protected _getCurrentNode() {
        return this.openedNode[this.openedNode.length - 1];
    }

    protected _getCurrentNodeBaseName() {
        return this._getCurrentNode()?.name;
    }

    protected _nodeIsSelfClosing(node: Partial<Tag>) {
        return node.isSelfClosing;
    }

    protected _nodeHasChildNodes(node: Partial<TaskTag>) {
        return size(node.newChildNodes) > 0;
    }
    // #endregion

    // #region writters
    protected async writeHeader() {
        await this.writeOnStream(xmlScribe.declaration({}));
        this.isFirstOutputLine = false;
    }

    protected async writeOpenNode(node: Tag | Partial<TaskTag>) {
        // identation
        if (this.identation) await this._addIdentation(this.identationPosition, this.identation);
        await this.writeOnStream(xmlScribe.open(node.name, node.attributes, node.isSelfClosing));

        // identation (sax await calls closeTag event)
        // if (!node.isSelfClosing) {
        this.lastOpenedTagName = node.name;
        this.identationPosition++;
        // }
    }

    protected async writeCloseNode(node: Tag | Partial<TaskTag>) {
        // identation (sax await calls closeTag event)
        // if (!node.isSelfClosing) {
        this.lastClosedNodeName = node.name;
        this.identationPosition--;
        // }

        // avoids to breakline or ident <tag>content     </tag> after content
        if (this.identation && this.lastOpenedTagName !== this.lastClosedNodeName)
            await this._addIdentation(this.identationPosition, this.identation);
        if (!this._nodeIsSelfClosing(node)) await this.writeOnStream(xmlScribe.close(node.name));
    }

    protected async _writeNodeValue(text: string) {
        await this.writeOnStream(`${text || ''}`);
    }

    protected async writeNodeValue(text: string) {
        if (this._shouldSkipNextContent()) return;
        await this._writeNodeValue(text);
    }

    async writeOnStream(text) {
        if (!this.outputStream) return;
        await this.outputStream.write(text);
    }
    // #endregion

    // #region new tags
    async writeNewTag(node: Tag | Partial<TaskTag>) {
        await this.writeOpenNode(node);

        if (!this._nodeIsSelfClosing(node)) {
            await this._writeNodeContent(node);
        }

        // sax await calls closeTag event. keeping same behavior
        await this.writeCloseNode(node);
    }

    protected async _writeNodeContent(node: Partial<TaskTag>) {
        if (node.newChildNodes) {
            await this._writeNewChildNodes(node);
            return;
        }

        await this.writeNodeValue(node.value);
    }

    protected async _writeNewChildNodes(node: Partial<TaskTag>) {
        if (!this._nodeIsSelfClosing(node) && this._nodeHasChildNodes(node)) {
            for (const index in node.newChildNodes) {
                const childNode = node.newChildNodes[index];
                await this.writeNewTag(childNode);
            }
        }
    }
    // #endregion

    // #region identation
    protected async _replicateIdentation() {
        await this._addIdentation(this.identationPosition);
    }

    protected async _addIdentation(position = 1, breakLineBefore = false) {
        const size = position * this.identationSize;
        if (breakLineBefore) {
            if (!this.isFirstOutputLine) await this._breakLine();
            this.isFirstOutputLine = false;
        }
        if (size) await this.writeOnStream(''.padEnd(size, ' '));
    }

    protected async _breakLine() {
        await this.writeOnStream(this.lineBreaker);
    }
    // #endregion

    // #region tree
    protected getLastOpenedNode(): Partial<TaskTag> {
        return this.openedNode[this.openedNode.length - 1];
    }

    protected _addOpenedNode(node: Partial<TaskTag>) {
        this.openedNode.push(node);
    }

    protected _removeLastOpenedNode() {
        this.openedNode.pop();
    }

    protected addOpenedNode(node: Partial<TaskTag>) {
        this._addOpenedNode(node);
    }

    protected removeLastOpenedNode() {
        this._removeLastOpenedNode();
    }
    // #endregion
}
