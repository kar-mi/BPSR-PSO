import pino from 'pino';

class Logger {
    constructor() {
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
        this.logger.info(context, message);
    }

    error(message, context = {}) {
        this.logger.error(context, message);
    }

    warn(message, context = {}) {
        this.logger.warn(context, message);
    }

    debug(message, context = {}) {
        this.logger.debug(context, message);
    }

    /**
     * Flush and close the logger
     * @returns {Promise<void>}
     */
    async flush() {
        return new Promise((resolve) => {
            if (this.logger && this.logger[pino.symbols.streamSym]) {
                this.logger.flush();
                // Give the stream time to flush
                setTimeout(resolve, 100);
            } else {
                resolve();
            }
        });
    }
}

export default new Logger();
