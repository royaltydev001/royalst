import type { Track } from "../types";

class QueueManager {

    queue: Track[];
    currentIndex: number;

    constructor() {

        this.queue = [];
        this.currentIndex = -1;

    }

    set(items: Track[] = [], startIndex = 0) {

        this.queue = [...items];
        this.currentIndex = this.queue.length ? Math.min(Math.max(startIndex, 0), this.queue.length - 1) : -1;

    }

    add(track: Track | null | undefined): Track | null {

        if (!track) return null;

        this.queue.push(track);

        if (this.queue.length === 1) {
            this.currentIndex = 0;
        }

        return track;

    }

    clear() {

        this.queue = [];
        this.currentIndex = -1;

    }

    next(): Track | null {

        if (this.currentIndex < 0 || this.currentIndex >= this.queue.length - 1) return null;

        this.currentIndex += 1;

        return this.current;

    }

    previous(): Track | null {

        if (!this.queue.length) return null;

        if (this.currentIndex > 0) {
            this.currentIndex -= 1;
        }

        return this.current;

    }

    get current(): Track | null {

        if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) {
            return null;
        }

        return this.queue[this.currentIndex];

    }

}

export default new QueueManager();
