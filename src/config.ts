// Application configuration.

export const CONFIG = {
    APP_NAME: "RoyalStream",
    VERSION: "2.0.0",

    JAMENDO: {
        CLIENT_ID: "c2d297d8",
        BASE_URL: "https://api.jamendo.com/v3.0"
    },

    AUDIUS: {
        BASE_URL: "https://discoveryprovider.audius.co/v1"
    },

    PLAYER: {
        DEFAULT_VOLUME: 0.8,
        SEEK_INTERVAL: 10
    },

    CACHE: {
        NAME: "royalstream-v2-v1"
    }
} as const;
