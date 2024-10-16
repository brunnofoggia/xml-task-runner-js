import { XmlTaskBuilder } from './xmlTaskBuilder';
import { Tag } from 'sax-async/lib/index';
import { TaskTag, XmlTasks } from './interfaces/task.interface';

describe('XmlTaskBuilder', () => {
    let xmlTaskBuilder: XmlTaskBuilder;

    beforeEach(() => {
        xmlTaskBuilder = new XmlTaskBuilder();
    });

    it('should initialize with default values', () => {
        expect(xmlTaskBuilder['taskList']).toEqual([]);
        expect(xmlTaskBuilder['processingTagList']).toEqual({});
        expect(xmlTaskBuilder['taskChildOptions']).toBe(false);
        expect(xmlTaskBuilder['skipNextContent']).toBe(false);
        expect(xmlTaskBuilder['lastCalledOpenTagName']).toBe('');
        expect(xmlTaskBuilder['lastCalledCloseTagName']).toBe('');
        expect(xmlTaskBuilder['taskOpenedNode']).toEqual([]);
        expect(xmlTaskBuilder['taskChildOpenedNode']).toEqual([]);
        expect(xmlTaskBuilder['treeCounter']).toEqual({});
        expect(xmlTaskBuilder['attributesKey']).toBe('$');
        expect(xmlTaskBuilder['valueKey']).toBe('_');
    });

    describe('tasks', () => {
        it('should add a task', () => {
            const taskName = 'testTask';
            const callback = jest.fn();

            xmlTaskBuilder.addTask(taskName, callback);

            expect(xmlTaskBuilder['taskList'].length).toBe(1);
            expect(xmlTaskBuilder['taskList'][0].name).toBe(taskName);
            expect(xmlTaskBuilder['taskList'][0].callback).toBe(callback);
        });

        it('should find a task by name', () => {
            const taskName = 'testTask';
            const callback = jest.fn();

            xmlTaskBuilder.addTask(taskName, callback);

            const foundTask = xmlTaskBuilder['findTask'](taskName);

            expect(foundTask).toBeDefined();
            expect(foundTask.name).toBe(taskName);
            expect(foundTask.callback).toBe(callback);
        });

        it('should not find a task if it does not exist', () => {
            const foundTask = xmlTaskBuilder['findTask']('nonExistentTask');

            expect(foundTask).toBeUndefined();
        });

        it('should build a node from task', () => {
            const taskNode: Partial<TaskTag> = {
                name: 'testNode',
                newName: 'newTestNode',
                attributes: { id: '123' },
                newAttributes: { id: '456' },
            };

            const node = xmlTaskBuilder['buildNodeFromTask'](taskNode);

            expect(node.name).toBe('newTestNode');
            expect(node.attributes).toEqual({ id: '456' });
            expect(node.isSelfClosing).toBeUndefined();
        });
    });

    describe('trace of opened/closed tags', () => {
        it('should write task open node', async () => {
            const node: Tag = {
                name: 'testNode',
                attributes: {},
                isSelfClosing: false,
            };

            jest.spyOn(xmlTaskBuilder as any, 'addOpenedNode');
            jest.spyOn(xmlTaskBuilder as any, 'addTaskOpenedNode');

            await xmlTaskBuilder['writeTaskOpenNode'](node);

            expect(xmlTaskBuilder['lastCalledOpenTagName']).toBe('testNode');
            expect(xmlTaskBuilder['addOpenedNode']).toHaveBeenCalledWith(node);
            expect(xmlTaskBuilder['addTaskOpenedNode']).toHaveBeenCalledWith(node);
        });

        it('should write task close node', async () => {
            const node: Tag = {
                name: 'testNode',
                attributes: {},
                isSelfClosing: false,
            };

            jest.spyOn(xmlTaskBuilder as any, 'removeLastOpenedNode');
            jest.spyOn(xmlTaskBuilder as any, 'removeLastTaskOpenedNode');

            await xmlTaskBuilder['writeTaskCloseNode'](node);

            expect(xmlTaskBuilder['lastCalledCloseTagName']).toBe('testNode');
            expect(xmlTaskBuilder['removeLastOpenedNode']).toHaveBeenCalled();
            expect(xmlTaskBuilder['removeLastTaskOpenedNode']).toHaveBeenCalled();
        });
    });
});
