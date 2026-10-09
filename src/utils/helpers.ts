// General-purpose helpers.

export function debounce<T extends (...args: any[]) => unknown>(fn: T, delay = 300): (...args: Parameters<T>) => void {

    let timer: ReturnType<typeof setTimeout>;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(() => fn(...args), delay);

    };

}

export function shuffle<T>(array: T[]): T[] {

    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [copy[i], copy[j]] = [copy[j], copy[i]];

    }

    return copy;

}

export function unique<T extends object>(array: T[], property: keyof T = "id" as keyof T): T[] {

    return array.filter(
        (item, index, self) =>
            index === self.findIndex(t => t[property] === item[property])
    );

}

export function sleep(ms: number): Promise<void> {

    return new Promise(resolve => setTimeout(resolve, ms));

}
