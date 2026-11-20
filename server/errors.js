import {createHash} from 'node:crypto';
export class ApiError extends Error {constructor(status,message,details={}){super(message);this.status=status;this.details=details;}}
export const digest=value=>createHash('sha256').update(value).digest('hex');
