declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_TOKEN: string;
      DISCORD_CLIENT_ID: string;
      DISCORD_GUILD_ID?: string;
      DATABASE_URL: string;
      SESSION_TIMEOUT_MS?: string;
    }
  }
}

export {};
