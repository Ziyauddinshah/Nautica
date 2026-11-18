import { afterEach, beforeEach, vi } from 'vitest';
import { installApiMock } from './apiMock.js';
import { cleanup } from '@testing-library/react';
beforeEach(()=>installApiMock());
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
