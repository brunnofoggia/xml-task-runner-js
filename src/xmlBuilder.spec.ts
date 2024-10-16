import { Writable } from 'stream';
import { XmlBuilder } from './xmlBuilder';
import { Tag } from 'sax-async/lib/index';
import { TaskTag } from 'interfaces/task.interface';

function s(size) {
    return ' '.repeat(size);
}

class MockWritable extends Writable {
    data: string = '';

    _write(chunk: any, encoding: string, callback: Function) {
        this.data += chunk.toString();
        callback();
    }
}

describe('XmlBuilder', () => {
    let xmlBuilder: XmlBuilder;
    let mockStream: MockWritable;

    beforeEach(() => {
        mockStream = new MockWritable();
        xmlBuilder = new XmlBuilder();
        xmlBuilder.setParams({ identation: false, outputStream: mockStream });
    });

    describe('writers', () => {
        test('should write open node correctly', async () => {
            const node: Tag = { name: 'test', attributes: {}, isSelfClosing: false };
            await xmlBuilder.writeNewTag(node);
            expect(mockStream.data).toContain('<test>');
        });

        test('should write close node correctly', async () => {
            const node: Tag = { name: 'test', attributes: {}, isSelfClosing: false };
            await xmlBuilder.writeNewTag(node);
            expect(mockStream.data).toContain('</test>');
        });

        test('should write self-closing node correctly', async () => {
            const node: Tag = { name: 'test', attributes: {}, isSelfClosing: true };
            await xmlBuilder.writeNewTag(node);
            expect(mockStream.data).toContain('<test />');
        });

        test('should write node value correctly', async () => {
            const node: Partial<TaskTag> = { name: 'test', attributes: {}, isSelfClosing: false, value: 'content' };
            await xmlBuilder.writeNewTag(node);
            expect(mockStream.data).toContain('<test>content</test>');
        });

        test('should handle nested nodes correctly', async () => {
            const parentNode: Partial<TaskTag> = { name: 'parent', attributes: {}, isSelfClosing: false, childNodes: [] };
            const childNode: Partial<TaskTag> = { name: 'child', attributes: {}, isSelfClosing: false, value: 'child content' };
            parentNode.childNodes.push(childNode);
            await xmlBuilder.writeNewTag(parentNode);
            expect(mockStream.data).toContain('<parent><child>child content</child></parent>');
        });

        test('should handle nested nodes with attributes correctly', async () => {
            const parentNode: Partial<TaskTag> = { name: 'parent', attributes: { key: 'value' }, isSelfClosing: false, childNodes: [] };
            const childNode: Partial<TaskTag> = { name: 'child', attributes: { key: 'value' }, isSelfClosing: false, value: 'child content' };
            parentNode.childNodes.push(childNode);
            await xmlBuilder.writeNewTag(parentNode);
            expect(mockStream.data).toContain('<parent key="value"><child key="value">child content</child></parent>');
        });

        test('should handle many nested nodes correctly', async () => {
            const parentNode: Partial<TaskTag> = { name: 'parent', attributes: {}, isSelfClosing: false, childNodes: [] };
            const childNode: Partial<TaskTag> = { name: 'child', attributes: {}, isSelfClosing: false, value: 'child content', childNodes: [] };
            const grandChildNode: Partial<TaskTag> = { name: 'grandchild', attributes: {}, isSelfClosing: false, value: 'grandchild content' };
            childNode.childNodes.push(grandChildNode);
            parentNode.childNodes.push(childNode);

            await xmlBuilder.writeNewTag(parentNode);
            expect(mockStream.data).toContain('<parent><child><grandchild>grandchild content</grandchild></child></parent>');
        });
    });

    describe('identation', () => {
        test('should write identation correctly', async () => {
            xmlBuilder.setParams({ identation: true, identationSize: 2, outputStream: mockStream });
            const parentNode: Partial<TaskTag> = { name: 'parent', attributes: {}, isSelfClosing: false, childNodes: [] };
            const childNode: Partial<TaskTag> = { name: 'child', attributes: {}, isSelfClosing: false, value: 'child content', childNodes: [] };
            const grandChildNode: Partial<TaskTag> = { name: 'grandchild', attributes: {}, isSelfClosing: false, value: 'grandchild content' };
            childNode.childNodes.push(grandChildNode);
            parentNode.childNodes.push(childNode);

            await xmlBuilder.writeNewTag(parentNode);
            expect(mockStream.data).toContain(
                `<parent>\n${s(2)}<child>\n${s(4)}<grandchild>grandchild content</grandchild>\n${s(2)}</child>\n</parent>`,
            );
        });

        test('should write identation correctly event when there is a grand child self closing', async () => {
            xmlBuilder.setParams({ identation: true, identationSize: 2, outputStream: mockStream });
            const parentNode: Partial<TaskTag> = { name: 'parent', attributes: {}, isSelfClosing: false, childNodes: [] };
            const childNode: Partial<TaskTag> = { name: 'child', attributes: {}, isSelfClosing: false, value: 'child content', childNodes: [] };
            const grandChildNode1: Partial<TaskTag> = { name: 'grandchild', attributes: {}, isSelfClosing: true, value: 'grandchild content' };
            const grandChildNode2: Partial<TaskTag> = { name: 'grandchild', attributes: {}, isSelfClosing: false, value: 'grandchild content' };
            childNode.childNodes.push(grandChildNode1, grandChildNode2);
            parentNode.childNodes.push(childNode);

            await xmlBuilder.writeNewTag(parentNode);
            expect(mockStream.data).toContain(
                `<parent>\n${s(2)}<child>\n${s(4)}<grandchild />\n${s(4)}<grandchild>grandchild content</grandchild>\n${s(2)}</child>\n</parent>`,
            );
        });
    });
});
