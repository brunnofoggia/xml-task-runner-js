import { NodeElementAttributes, Tag } from 'sax-async/lib/index';

import { XmlBuilder } from '../xmlBuilder';
import { XmlBuilderParams } from './builder.interface';

export interface XmlTasks {
    name: string;
    callback: TaskCallbackFn;
    options?: { recordOriginalNodeData?: boolean };
}

export interface TaskTag {
    name: string;
    newName: string;
    attributes: NodeElementAttributes;
    newAttributes: NodeElementAttributes;
    isSelfClosing: boolean;
    childNodes: Partial<TaskTag>[];
    keepParentChildNodesAt: 'inside' | 'outside';
    updateTaskNodeOptions: any;
    childOptions: any;
    deleteTag: boolean;
    deleteChildNodes: boolean;
    stash: any;
    value?: string;
    // stash: { value: string } | { [key: string]: string };
    // lifecycle
    beforeTagOpenWrite: (node: Partial<TaskTag>, instance: XmlBuilder) => void;
    afterTagOpenWrite: (node: Partial<TaskTag>, instance: XmlBuilder) => void;
    beforeTagCloseWrite: (node: Partial<TaskTag>, instance: XmlBuilder) => void;
    afterTagCloseWrite: (node: Partial<TaskTag>, instance: XmlBuilder) => void;
}

export interface XmlParserContructorParams {
    xmlInput: string;
    xmlOutputDir: string;
}

export interface TaskCallbackArguments {
    node: Tag;
    taskNode: Partial<TaskTag>;
    stash?: Record<string, any>;
}

export interface TaskCallbackFn {
    (node: Tag, taskNode: Record<string, any>, stash?: Record<string, any>): Promise<Partial<TaskTag>> | Partial<TaskTag>;
}

export interface InitializeFunction {
    (params: { xmlInput: string; xmlOutputDir: string }): void;
}

export interface ProcessingTagList {
    [key: string]: ProcessingTag;
}

export interface ProcessingTag {
    node: Tag;
    taskNode?: Partial<TaskTag>;
}

export interface XmlParserParams extends XmlBuilderParams {
    header: Partial<{
        print: boolean;
        encoding: string;
        standalone: string;
    }>;
    inputStream: NodeJS.ReadableStream;
    clearIdentation: boolean;
}
