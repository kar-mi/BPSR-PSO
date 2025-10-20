import pino from 'pino';

class Logger {
    constructor() {
        this.isShuttingDown = false;
        this.logger = pino({
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                },
            },
        });
    }

    info(message, context = {}) {
        if (this.isShuttingDown) return;
        try {
            this.logger.info(context, message);
        } catch (err) {
            // Suppress errors during shutdown
        }
    }

    error(message, context = {}) {
        if (this.isShuttingDown) return;
        try {
            this.logger.error(context, message);
        } catch (err) {
            // Suppress errors during shutdown
        }
    }

    warn(message, context = {}) {
        if (this.isShuttingDown) return;
        try {
            this.logger.warn(context, message);
        } catch (err) {
            // Suppress errors during shutdown
        }
    }

    debug(message, context = {}) {
        if (this.isShuttingDown) return;
        try {
            this.logger.debug(context, message);
        } catch (err) {
            // Suppress errors during shutdown
        }
    }

    /**
     * Flush and close the logger
     * @returns {Promise<void>}
     */
    async flush() {
        this.isShuttingDown = true;
        return new Promise((resolve) => {
            if (this.logger && this.logger[pino.symbols.streamSym]) {
                try {
                    this.logger.flush();
                } catch (err) {
                    // Ignore flush errors during shutdown
                }
                // Give the stream time to flush
                setTimeout(resolve, 100);
            } else {
                resolve();
            }
        });
    }
}

export default new Logger();
