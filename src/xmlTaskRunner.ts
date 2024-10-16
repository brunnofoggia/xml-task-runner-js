import { size, bind, clone, defaults, isBoolean } from 'lodash';

import { Tag } from 'sax-async/lib/interfaces/sax.interface';
import { SaxAsync } from 'sax-async/lib/index';

import { XmlTasks, XmlParserParams } from './interfaces/task.interface';
import { XmlTaskBuilder } from './xmlTaskBuilder';
import { Err } from './common/utils/error';
import { ERROR_CODE } from './enum/error';

export class XmlTaskRunner extends XmlTaskBuilder {
    // #region attributes
    inputStream: NodeJS.ReadableStream;
    clearIdentation: boolean = false;
    identation: boolean = true;
    parser: SaxAsync;
    // #endregion

    // #region core
    async execute(options: any = {}) {
        this.checkParams();

        // Enable string reading mode
        this.inputStream.setEncoding('utf-8');

        // Write header
        if (this.header?.print) {
            this.writeHeader();
        }

        this.parser = new SaxAsync(true, { ...options, stream: this.inputStream });
        this.parser.on('opentag', bind(this._eventOpenTag, this));
        this.parser.on('text', bind(this._eventText, this));
        this.parser.on('closetag', bind(this._eventCloseTag, this));
        this.parser.on('end', bind(this._eventStreamEnd, this));

        await this.parser.execute();
    }

    protected checkParams(): void {
        super.checkParams();
        if (!this.inputStream) {
            throw new Err('input stream is required', ERROR_CODE.READSTREAM_NOT_SET);
        }
    }

    setParams(params: Partial<XmlParserParams>) {
        super.setParams(params);

        if (params.header) {
            this.header = isBoolean(params.header) && params.header === true ? { print: true } : params.header;
        }
        if (params.inputStream) this.inputStream = params.inputStream;
        if (params.clearIdentation !== undefined) this.clearIdentation = params.clearIdentation;
    }

    protected isTextOfIdentation(text: string) {
        return text.indexOf('\n') === 0 && !text?.trim();
    }
    // #endregion

    // #region events
    protected async _eventOpenTag(node: Tag) {
        const task = this.findTask(node.name);
        this.processingTagList[node.name] = { node };

        if (!task) await this.writeOpenNode(node);
        else await this._executeOpenTagTask(node, task);
    }

    // all texts are processed here, even if they are not a part of a task
    protected async _eventText(text: string) {
        const isTextOfIdentation = this.isTextOfIdentation(text);
        const lastTaskOpenedNode = this.getLastTaskOpenedNode();
        const lastOpenedNode = this.getLastOpenedNode();

        if (isTextOfIdentation) {
            if (this.identation || this.clearIdentation) return;
        } else {
            // collect data from node when it is the content of a tasknode or
            // when the tasknode has the collect option enabled for its childs
            const isTaskNodeContent = lastTaskOpenedNode && lastTaskOpenedNode.name === lastOpenedNode.name;
            if (isTaskNodeContent || this.taskChildOptions.collect) {
                const childOptions = this.taskChildOptions;
                const result = await this.pushChildNodeContent(lastTaskOpenedNode, text, this.lastCalledOpenTagName, childOptions);
                if (typeof result.value !== 'undefined') text = result.value;
            }
        }

        await this.writeNodeValue(text);
    }

    protected async _eventCloseTag(name: string) {
        const task = this.findTask(name);
        const { node } = this.processingTagList[name];

        if (!task) {
            await this.writeCloseNode(node);
            delete this.processingTagList[name];
        } else {
            await this._executeCloseTagTask(task, node);
        }
    }

    protected _eventStreamEnd() {
        if (!this.outputStream) return;
        return this.outputStream.end();
    }
    // #endregion

    // #region tasks
    protected async _executeOpenTagTask(node: Tag, task: XmlTasks) {
        const taskNode = await this._createTaskNode(task, node);
        this.taskChildOptions = taskNode.childOptions;

        // const shouldCollectChildAttributes = this.shouldCollectChildNodesAttributes(taskNode);
        // TODO: rewrite attributes using stash
        // XXX: review this
        // if (shouldCollectChildAttributes) {
        // save task attributes
        await this.pushNodeAttributes(taskNode, clone(taskNode.attributes));
        // }

        await this.writeTaskOpenNode(taskNode);
    }

    protected async _executeCloseTagTask(task: XmlTasks, node: Tag) {
        const taskNode = this.processingTagList[node.name].taskNode;

        // ensure to write new child nodes
        if (!this._isDeletedTaskNode(taskNode)) this.skipNextContent = false;
        await this._writeNewChildNodes(taskNode);

        this.taskChildOptions = {};
        delete this.processingTagList[node.name];

        await this.writeTaskCloseNode(taskNode);
    }
    // #endregion
}
