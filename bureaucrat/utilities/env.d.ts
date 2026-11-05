declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_TOKEN: string;
      DISCORD_CLIENT_ID: string;
      DISCORD_GUILD_ID?: string;
      DATABASE_URL: string;
      TEMPORARY_VIEW_TIMEOUT_MS?: string;
      OFFSITE_CONCURRENCY?: string;
      DATABASE_POOL_SIZE?: string;
      OFFSITE_READERS?: string;
      OFFSITE_WRITERS?: string;
      LOG_LEVEL?: string;
    }
  }
}

export {};
