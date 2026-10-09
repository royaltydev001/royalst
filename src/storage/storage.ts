// Typed local storage helpers.

export default class Storage {

    static get<T = unknown>(key: string, fallback: T | null = null): T | null {

        try {

            const value = localStorage.getItem(key);

            return value ? JSON.parse(value) as T : fallback;

        }

        catch {

            return fallback;

        }

    }

    static set(key: string, value: unknown): boolean {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    static remove(key: string): boolean {
        try {
            localStorage.removeItem(key);
            return true;
        } catch {
            return false;
        }
    }

    static clear(): boolean {
        try {
            localStorage.clear();
            return true;
        } catch {
            return false;
        }
    }

}
