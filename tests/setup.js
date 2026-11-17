import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
