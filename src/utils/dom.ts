// DOM helpers.

export const $ = (selector: string, parent: ParentNode = document) =>
    parent.querySelector(selector);

export const $$ = (selector: string, parent: ParentNode = document) =>
    [...parent.querySelectorAll(selector)];

interface CreateOptions {
    className?: string;
    id?: string;
    text?: string;
    html?: string;
    attributes?: Record<string, string>;
}

export function create(tag: string, options: CreateOptions = {}): HTMLElement {

    const el = document.createElement(tag);

    if (options.className)
        el.className = options.className;

    if (options.id)
        el.id = options.id;

    if (options.text)
        el.textContent = options.text;

    if (options.html)
        el.innerHTML = options.html;

    if (options.attributes) {

        Object.entries(options.attributes).forEach(([key, value]) => {
            el.setAttribute(key, value);
        });

    }

    return el;

}
