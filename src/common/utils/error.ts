import { indexOf } from 'lodash';
import { ERROR_CODE, errorPrefix } from '../../enum/error';

export type ERROR_CODE_TYPE = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export const buildErrorCode = (code: number | string) => {
    if (typeof code === 'number' && indexOf(Object.values(ERROR_CODE), code) !== -1) {
        return [errorPrefix, code].join('-');
    }
    return code + '';
};

export class Err extends Error {
    code: string;
    constructor(message: string, code: ERROR_CODE_TYPE = ERROR_CODE.UNKNOWN) {
        super(message);
        this.code = buildErrorCode(code);
    }
}
