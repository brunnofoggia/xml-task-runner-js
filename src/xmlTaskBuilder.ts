import { cloneDeep, set, isBoolean, defaultsDeep, get, size, filter } from 'lodash';

import { Tag } from 'sax-async/lib/index';

import { TaskTag, XmlTasks, TaskCallbackFn, XmlParserParams, ProcessingTagList } from './interfaces/task.interface';
import { XmlBuilder } from './xmlBuilder';

const defaultParams: Partial<XmlParserParams> = {
    identation: true,
};

export class XmlTaskBuilder extends XmlBuilder {
    // #region attributes
    protected header: Partial<{
        print: boolean;
        encoding: string;
        standalone: string;
    }> = {};
    protected taskList: XmlTasks[] = [];

    protected processingTagList: ProcessingTagList = {};
    protected taskChildOptions: any = false;
    protected skipNextContent = false;

    protected lastCalledOpenTagName: string = '';
    protected lastCalledCloseTagName: string = '';

    // used to build tree of values
    protected taskOpenedNode: Partial<TaskTag>[] = [];
    protected taskChildOpenedNode: any[] = [];
    protected treeCounter: { [x: string]: number } = {};

    // $ is the alias for node attributes
    protected _attributesKey = '$';
    // _ is the alias for node value
    protected _valueKey = '_';

    protected get attributesKey() {
        return this._attributesKey;
    }

    protected get valueKey() {
        return this._valueKey;
    }
    // #endregion

    // #region getters / setters
    protected _getTaskNodeName(taskNode: Partial<TaskTag>) {
        return taskNode.newName || taskNode.name;
    }

    protected _isDeletedTaskNode(taskNode: Partial<TaskTag>) {
        return taskNode?.deleteTag;
    }

    protected _shouldDeleteChildNodes(taskNode: Partial<TaskTag>) {
        return taskNode?.deleteChildNodes;
    }

    protected _getTaskNodeAttributes(taskNode: Partial<TaskTag>) {
        return taskNode.newAttributes !== undefined ? taskNode.newAttributes : taskNode.attributes;
    }

    protected shouldCollectChildNodesAttributes(node: Tag) {
        return this.taskChildOptions.collect && size(node.attributes);
    }

    protected defineChildOptions(childOptions: any) {
        return defaultsDeep({}, childOptions, {
            collect: false,
            tree: true,
        });
    }
    // #endregion

    // #region writters
    protected async writeOpenNode(node: Tag) {
        this.lastCalledOpenTagName = node.name;
        if (!node.isSelfClosing) this.addOpenedNode(node);

        const taskNode = this.getLastTaskOpenedNode();
        const isTaskChildNode = !!taskNode;
        const shouldCollectChildAttributes = this.shouldCollectChildNodesAttributes(node);

        // save child attributes
        if (isTaskChildNode && shouldCollectChildAttributes) {
            const childOptions = this.taskChildOptions;
            await this.pushChildNodeAttributes(taskNode, node.attributes, node.name, childOptions);
        }

        if (!this.skipNextContent) await super.writeOpenNode(node);
    }

    protected async writeTaskOpenNode(taskNode: Partial<TaskTag>) {
        // allows to override task node properties (mostly to make changes into attributes)
        if (taskNode.beforeTagOpenWrite) await taskNode.beforeTagOpenWrite(taskNode, this);

        const isDeletedNode = this._isDeletedTaskNode(taskNode);
        const shouldDeleteChildNodes = this._shouldDeleteChildNodes(taskNode);

        if (!isDeletedNode) {
            if (isDeletedNode === false) this.skipNextContent = false;
            const node = this.buildNodeFromTask(taskNode);
            await this.writeOpenNode(node);

            if (shouldDeleteChildNodes) this.skipNextContent = true;
        } else {
            this.skipNextContent = true;
        }

        if (taskNode.afterTagOpenWrite) await taskNode.afterTagOpenWrite(taskNode, this);
        this.addTaskOpenedNode(taskNode);
    }

    protected async writeCloseNode(node: Tag) {
        this.lastCalledCloseTagName = node.name;

        if (!this.skipNextContent) await super.writeCloseNode(node);
        this.removeLastOpenedNode();
    }

    protected async writeTaskCloseNode(taskNode: Partial<TaskTag>) {
        this.removeLastTaskOpenedNode();
        if (taskNode.beforeTagCloseWrite) await taskNode.beforeTagCloseWrite(taskNode, this);

        const isDeletedNode = this._isDeletedTaskNode(taskNode);
        const shouldDeleteChildNodes = this._shouldDeleteChildNodes(taskNode);
        if (!isDeletedNode) {
            // avoid missing close tag after deleting child nodes
            if (shouldDeleteChildNodes) this.skipNextContent = false;

            // XXX: disabled to follow the same behavior as the original sax events does
            // if (this._nodeIsSelfClosing(taskNode)) return;

            const node = this.buildNodeFromTask(taskNode);
            await this.writeCloseNode(node);
        }

        // reset value for next node only if is a task node with the setting
        if (isDeletedNode) this.skipNextContent = false;

        if (taskNode.afterTagCloseWrite) await taskNode.afterTagCloseWrite(taskNode, this);
    }

    protected async _writeNewChildNodes(taskNode: Partial<TaskTag>) {
        if (this._isDeletedTaskNode(taskNode)) return;
        // doesnt check if should delete child nodes because they were already deleted

        // these child nodes are those manually added by the task
        await super._writeNewChildNodes(taskNode);
    }
    // #endregion

    // #region tasks
    protected async _createTaskNode(task: XmlTasks, node?: Tag) {
        // INFO: will run task callback function received to update its interpolated strings. for example `PDF_NUMERO_${values.value}.pdf`
        const _updateTaskNodeOptionsFn = async (node, taskNode = null, stash: any = {}) => {
            try {
                const result = await task.callback(node, taskNode, stash);
                return result;
            } catch (err) {
                // errors may happen while collecting child node values to compose new child node values
                // debug('Error on parserCallback', err);
            }
            return {};
        };

        const data = await _updateTaskNodeOptionsFn(node);

        const taskNode: Partial<TaskTag> = {};
        taskNode.name = node.name;
        taskNode.attributes = node.attributes;

        // lists
        taskNode.childNodes = defaultsDeep({}, data.childNodes);
        taskNode.childOptions = defaultsDeep({}, this.defineChildOptions(data.childOptions));

        // lifecycle functions
        taskNode.beforeTagOpenWrite = data.beforeTagOpenWrite;
        taskNode.afterTagOpenWrite = data.afterTagOpenWrite;
        taskNode.beforeTagCloseWrite = data.beforeTagCloseWrite;
        taskNode.afterTagCloseWrite = data.afterTagCloseWrite;

        taskNode.newName = data.newName || node.name;
        taskNode.newAttributes = data.newAttributes;
        taskNode.stash = defaultsDeep({}, data.stash);
        taskNode.deleteTag = !!data.deleteTag;
        taskNode.deleteChildNodes = !!data.deleteChildNodes;

        // keep task child node stash updated after receiving existent child node values + attributes
        taskNode.updateTaskNodeOptions = async (stash) => {
            let updatedTaskOptions = await _updateTaskNodeOptionsFn(node, taskNode, stash);
            if (!updatedTaskOptions || !size(updatedTaskOptions)) return;
            // ensure not to replace options when working with multiple ocurrences of the same tag
            updatedTaskOptions = cloneDeep(updatedTaskOptions);

            for (const key in updatedTaskOptions) {
                // skip other options
                if (key in taskNode) {
                    taskNode[key] = updatedTaskOptions[key];
                }
            }
        };

        this.processingTagList[node.name].taskNode = taskNode;
        return taskNode as TaskTag;
    }

    addTask(name: string, callback: TaskCallbackFn): void {
        this.taskList.push({
            name: name,
            callback,
        });
    }

    protected findTask(name: string) {
        return this.taskList.find((task) => task.name === name);
    }

    protected buildNodeFromTask(taskNode) {
        const nodeName = this._getTaskNodeName(taskNode);
        const isSelfClosing = this._nodeIsSelfClosing(taskNode);
        const attributes = this._getTaskNodeAttributes(taskNode);
        const node = { name: nodeName, attributes, isSelfClosing };

        return node;
    }
    // #endregion

    // #region stash
    protected defineStashChildName(treeName, childName: string, childOptions: any = {}) {
        let newChildName = childName;
        newChildName = this.composeChildNameForTree(treeName, childName, childOptions);

        return newChildName;
    }

    protected defineStashChildNameForValue(treeName, childName: string, childOptions: any = {}) {
        const newChildName = this.defineStashChildName(treeName, childName, childOptions);
        return [newChildName, this.valueKey].join('.');
    }

    protected defineStashChildNameForAttributes(treeName, childName: string, childOptions: any = {}) {
        const newChildName = this.defineStashChildName(treeName, childName, childOptions);
        return [newChildName, this.attributesKey].join('.');
    }

    protected async pushNodeAttributes(taskNode: Partial<TaskTag>, nodeAttributes) {
        const attributesKey = this.attributesKey;
        set(taskNode.stash, attributesKey, nodeAttributes);
        await taskNode.updateTaskNodeOptions(taskNode.stash);

        const newValue = get(taskNode.stash, attributesKey, nodeAttributes);
        return { taskNode, value: newValue };
    }

    protected async pushChildNodeAttributes(parentNode: Partial<TaskTag>, childAttributes, childName, childOptions: any = {}) {
        // const lastTaskOpenedNode = this.getLastTaskOpenedNode();
        const parentBaseName = parentNode.name;
        const taskNode = this.processingTagList[parentBaseName].taskNode;
        const treeName = this.buildTaskChildOpenedNodeTreeName();
        const newChildNameForAttributes = this.defineStashChildNameForAttributes(treeName, childName, childOptions);

        set(taskNode.stash, newChildNameForAttributes, childAttributes);
        await taskNode.updateTaskNodeOptions(taskNode.stash);

        return { taskNode };
    }

    protected async pushChildNodeContent(parentNode: Partial<TaskTag>, childValue, childName, childOptions: any = {}) {
        const parentBaseName = parentNode.name;
        const taskNode = this.processingTagList[parentBaseName].taskNode;
        const treeName = this.buildTaskChildOpenedNodeTreeName();
        const newChildNameForValue = this.defineStashChildNameForValue(treeName, childName, childOptions);

        set(taskNode.stash, newChildNameForValue, childValue);
        await taskNode.updateTaskNodeOptions(taskNode.stash);
        const newChildValue = get(taskNode.stash, newChildNameForValue, undefined);

        return { taskNode, value: newChildValue };
    }
    // #endregion

    // #region tree
    protected getLastTaskOpenedNode(): Partial<TaskTag> {
        return this.taskOpenedNode[this.taskOpenedNode.length - 1];
    }

    protected addTaskOpenedNode(node: Partial<TaskTag>) {
        this.taskOpenedNode.push(node);
        this.treeCounter = {};
        this.taskChildOpenedNode = [];
    }

    protected removeLastTaskOpenedNode() {
        this.taskOpenedNode.pop();
        this.taskChildOpenedNode = [];
    }

    protected addChildOpenedNode(node: Partial<TaskTag>) {
        this.taskChildOpenedNode.push(node);

        const current = this.buildTaskChildOpenedNodeTreeName(false, true);
        if (!current) return;

        if (!(current in this.treeCounter)) this.treeCounter[current] = 0;
        else this.treeCounter[current]++;
    }

    protected removeLastTaskChildOpenedNode() {
        this.taskChildOpenedNode.pop();
    }

    protected addOpenedNode(node: Partial<TaskTag>) {
        this._addOpenedNode(node);
        const lastTaskOpenedNode = this.getLastTaskOpenedNode();
        if (lastTaskOpenedNode?.childOptions?.collect) {
            this.addChildOpenedNode(node);
        }
    }

    protected removeLastOpenedNode() {
        this._removeLastOpenedNode();
        this.removeLastTaskChildOpenedNode();
    }

    getTaskChildOpenedNodeList() {
        if (this.taskChildOpenedNode.length) {
            return this.taskChildOpenedNode;
        }

        const filterTaskWithoutCollection = filter(this.taskOpenedNode, (node) => !!node.childOptions?.collect);

        return (filterTaskWithoutCollection.length ? filterTaskWithoutCollection : [this.getLastTaskOpenedNode()]) as Partial<TaskTag>[];
    }

    protected buildTaskChildOpenedNodeTreeName(skipLast: boolean = false, skipLastCounter = false): string {
        const name = [];

        const openedNodeList = this.getTaskChildOpenedNodeList();

        name.push(...this.buildOpenedNodeTreeName(openedNodeList, skipLastCounter).split('.'));
        if (skipLast) name.pop();

        return name.join('.');
    }

    protected buildOpenedNodeTreeName(tree: Partial<TaskTag>[], skipLastCounter = false): string {
        const name = [];
        const formatCounterName = (str) => str.replace(/\.\[/g, '[');
        const addTreeCounter = () => {
            if (name.length) {
                const current = formatCounterName(name.join('.'));
                // if (!this.treeCounter[current]) this.treeCounter[current] = 0;

                name.push(`[${this.treeCounter[current] || 0}]`);
            }
        };
        for (const node of tree) {
            addTreeCounter();
            name.push(node.name);
        }

        if (!skipLastCounter) addTreeCounter();

        let _name = name.join('.');
        _name = formatCounterName(_name);

        return _name;
    }

    protected composeChildNameForTree(treeName, childName: string, childOptions: any) {
        const newChildName = [];

        if (childOptions.tree) {
            const _treeName = isBoolean(childOptions.tree) ? treeName : childOptions.tree;

            _treeName && newChildName.push(_treeName);
        } else {
            newChildName.push(childName);
        }

        return newChildName.join('.');
    }
    // #endregion
}
