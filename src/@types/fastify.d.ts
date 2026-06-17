import type Database from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance<
    RawServer,
    RawRequest,
    RawReply,
    Logger,
    TypeProvider,
  > {
    db: Database.Database;
  }
}
